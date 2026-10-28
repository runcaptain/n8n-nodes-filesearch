import { createHash, createHmac, createSign } from 'crypto';

/**
 * Request signing for listing buckets, folders and files directly from the customer's storage,
 * so the node can offer dropdowns. Indexing itself still goes through the File Search API.
 */

const sha256Hex = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key: Buffer | string, data: string) =>
	createHmac('sha256', key).update(data, 'utf8').digest();

/** RFC 3986 encoding, as SigV4 and the S3 canonical query require. */
export function rfc3986(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/** Build a URL whose query string is already in SigV4 canonical form, so nothing re-encodes it. */
export function s3Url(
	base: string,
	path: string,
	query: Record<string, string | undefined> = {},
): string {
	const encodedPath = path
		.split('/')
		.map((segment) => rfc3986(segment))
		.join('/');
	const pairs = Object.entries(query)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `${rfc3986(k)}=${rfc3986(String(v))}`)
		.sort();
	return `${base.replace(/\/+$/, '')}${encodedPath.startsWith('/') ? '' : '/'}${encodedPath}${pairs.length ? `?${pairs.join('&')}` : ''}`;
}

/** AWS Signature Version 4 headers for a GET with an empty body. */
export function sigV4Headers(
	method: string,
	url: string,
	region: string,
	accessKeyId: string,
	secretAccessKey: string,
	now = new Date(),
	service = 's3',
): Record<string, string> {
	const parsed = new URL(url);
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
	const day = amzDate.slice(0, 8);
	const payloadHash = sha256Hex('');
	const host = parsed.host;
	const canonicalQuery = parsed.search
		.replace(/^\?/, '')
		.split('&')
		.filter(Boolean)
		.sort()
		.join('&');
	const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
	const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
	const canonicalRequest = [
		method.toUpperCase(),
		parsed.pathname || '/',
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join('\n');
	const scope = `${day}/${region}/${service}/aws4_request`;
	const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
	const key = hmac(
		hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service),
		'aws4_request',
	);
	const signature = createHmac('sha256', key).update(stringToSign, 'utf8').digest('hex');
	return {
		'x-amz-date': amzDate,
		'x-amz-content-sha256': payloadHash,
		Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
	};
}

/** The region a credential names: a listed region, or the code typed under "Other". */
export function credentialRegion(
	c: { region?: unknown; customRegion?: unknown },
	fallback = 'us-east-1',
): string {
	const region =
		c.region === 'other' ? String(c.customRegion ?? '').trim() : String(c.region ?? '');
	return region || fallback;
}

/** The signing region an S3-compatible host implies, or the fallback. */
export function regionFromHost(host: string, fallback: string): string {
	const aws = /^(?:[^.]+\.)?s3[.-]([a-z0-9-]+)\.amazonaws\.com$/.exec(host);
	if (aws) return aws[1];
	if (/(^|\.)s3\.amazonaws\.com$/.test(host)) return 'us-east-1';
	if (host.endsWith('.r2.cloudflarestorage.com')) return 'auto';
	const b2 = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(host);
	if (b2) return b2[1];
	return fallback || 'us-east-1';
}

/** Azure Storage Shared Key authorization for a GET with no body (service version 2021-08-06). */
export function azureSharedKeyHeaders(
	url: string,
	accountName: string,
	accountKey: string,
	now = new Date(),
): Record<string, string> {
	const parsed = new URL(url);
	const date = now.toUTCString();
	const version = '2021-08-06';
	const params = new Map<string, string[]>();
	parsed.searchParams.forEach((value, name) => {
		const key = name.toLowerCase();
		params.set(key, [...(params.get(key) ?? []), value]);
	});
	const canonicalizedResource =
		`/${accountName}${parsed.pathname || '/'}` +
		[...params.keys()]
			.sort()
			.map((k) => `\n${k}:${(params.get(k) ?? []).sort().join(',')}`)
			.join('');
	const canonicalizedHeaders = `x-ms-date:${date}\nx-ms-version:${version}\n`;
	// VERB, then 11 standard headers that are empty for a bodyless GET.
	const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\n${canonicalizedHeaders}${canonicalizedResource}`;
	const signature = createHmac('sha256', Buffer.from(accountKey, 'base64'))
		.update(stringToSign, 'utf8')
		.digest('base64');
	return {
		'x-ms-date': date,
		'x-ms-version': version,
		Authorization: `SharedKey ${accountName}:${signature}`,
	};
}

/** A signed JWT assertion for Google's OAuth token endpoint (service account flow). */
export function googleJwtAssertion(
	clientEmail: string,
	privateKey: string,
	scope: string,
	subject?: string,
	now = Math.floor(Date.now() / 1000),
): string {
	const base64url = (b: Buffer | string) =>
		Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
	const encode = (obj: object) => base64url(JSON.stringify(obj));
	const header = encode({ alg: 'RS256', typ: 'JWT' });
	const claims = encode({
		iss: clientEmail,
		scope,
		aud: 'https://oauth2.googleapis.com/token',
		iat: now,
		exp: now + 3600,
		...(subject ? { sub: subject } : {}),
	});
	const signature = base64url(
		createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey),
	);
	return `${header}.${claims}.${signature}`;
}

/** Values of every <tag>…</tag>, optionally only inside <parent> blocks. Enough for S3 and Azure list responses. */
export function xmlValues(xml: string, tag: string, parent?: string): string[] {
	const scope = parent
		? [...xml.matchAll(new RegExp(`<${parent}>([\\s\\S]*?)</${parent}>`, 'g'))].map((m) => m[1])
		: [xml];
	const decode = (s: string) =>
		s
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&amp;/g, '&');
	return scope.flatMap((block) =>
		[...block.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => decode(m[1])),
	);
}
