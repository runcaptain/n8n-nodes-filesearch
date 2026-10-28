// Runs against the built package: `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const { objectUri, globList } = require('../dist/nodes/CaptainFileSearch/actions');
const {
	buildMultipart,
	dropEmpty,
	keyValuePairs,
} = require('../dist/nodes/CaptainFileSearch/GenericFunctions');
const {
	verifySignature,
} = require('../dist/nodes/CaptainFileSearchTrigger/CaptainFileSearchTrigger.node');
const { CaptainFileSearch } = require('../dist/nodes/CaptainFileSearch/CaptainFileSearch.node');

test('objectUri builds the URI each storage endpoint expects', () => {
	assert.equal(objectUri('s3', 'docs', undefined, 'reports/q3.pdf'), 's3://docs/reports/q3.pdf');
	assert.equal(objectUri('s3', 'docs', undefined, '/reports/q3.pdf'), 's3://docs/reports/q3.pdf');
	assert.equal(objectUri('gcs', 'docs', undefined, 'a.pdf'), 'gs://docs/a.pdf');
	assert.equal(objectUri('r2', 'docs', undefined, 'a.pdf'), 'r2://docs/a.pdf');
	assert.equal(objectUri('backblaze', 'docs', undefined, 'a.pdf'), 's3://docs/a.pdf');
	assert.equal(objectUri('supabase', 'docs', undefined, 'a.pdf'), 's3://docs/a.pdf');
	assert.equal(
		objectUri('azure', 'container', 'acct', 'a.pdf'),
		'https://acct.blob.core.windows.net/container/a.pdf',
	);
	// A full URI typed by the user is passed through untouched.
	assert.equal(objectUri('s3', 'docs', undefined, 's3://other/x.pdf'), 's3://other/x.pdf');
});

test('buildMultipart encodes fields and files', () => {
	const { body, contentType } = buildMultipart(
		{ processing_type: 'basic', skip_existing: false, empty: '', custom_metadata: '{"a":1}' },
		[
			{
				field: 'files',
				filename: 'r"1.pdf',
				contentType: 'application/pdf',
				data: Buffer.from('%PDF-1'),
			},
		],
	);
	const boundary = contentType.split('boundary=')[1];
	const text = body.toString('utf8');
	assert.ok(contentType.startsWith('multipart/form-data; boundary='));
	assert.match(text, /name="processing_type"\r\n\r\nbasic\r\n/);
	assert.match(text, /name="skip_existing"\r\n\r\nfalse\r\n/);
	assert.doesNotMatch(text, /name="empty"/);
	assert.match(
		text,
		/name="files"; filename="r\\"1.pdf"\r\nContent-Type: application\/pdf\r\n\r\n%PDF-1\r\n/,
	);
	assert.ok(text.endsWith(`--${boundary}--\r\n`));
});

test('dropEmpty and keyValuePairs drop blanks', () => {
	assert.deepEqual(dropEmpty({ a: 1, b: '', c: undefined, d: [], e: false }), { a: 1, e: false });
	assert.deepEqual(
		keyValuePairs({
			values: [
				{ key: 'dept', value: 'legal' },
				{ key: ' ', value: 'x' },
			],
		}),
		{
			dept: 'legal',
		},
	);
	assert.equal(keyValuePairs({}), undefined);
});

test('verifySignature accepts a Standard Webhooks signature and rejects tampering', () => {
	const key = Buffer.from('n8n-test-secret-n8n-test-secret!');
	const secret = `whsec_${key.toString('base64')}`;
	const body = '{"type":"job.completed"}';
	const now = 1_800_000_000;
	const sign = (id, ts, b) => createHmac('sha256', key).update(`${id}.${ts}.${b}`).digest('base64');
	const headers = {
		'svix-id': 'msg_1',
		'svix-timestamp': String(now),
		'svix-signature': `v1,${sign('msg_1', now, body)}`,
	};

	assert.equal(verifySignature(secret, headers, body, now), true);
	assert.equal(
		verifySignature(
			secret,
			{
				'webhook-id': 'msg_1',
				'webhook-timestamp': String(now),
				'webhook-signature': `v0,x v1,${sign('msg_1', now, body)}`,
			},
			body,
			now,
		),
		true,
	);
	assert.equal(verifySignature(secret, headers, body.replace('completed', 'failed'), now), false);
	assert.equal(verifySignature(secret, headers, body, now + 10 * 60), false);
	assert.equal(verifySignature('', headers, body, now), false);
	assert.equal(
		verifySignature(secret, { ...headers, 'svix-signature': 'v1,AAAA' }, body, now),
		false,
	);
});

test('every operation value is unique across resources, so credential display rules stay unambiguous', () => {
	const { properties } = new CaptainFileSearch().description;
	const values = properties
		.filter((p) => p.name === 'operation')
		.flatMap((p) => p.options.map((o) => o.value));
	const shared = ['delete', 'get', 'getMany'];
	const sourceOps = values.filter((v) => !shared.includes(v));
	assert.equal(new Set(sourceOps).size, sourceOps.length);
});

test('globList keeps commas inside braces', () => {
	assert.deepEqual(globList('*.{pdf,docx}, contracts/**, '), ['*.{pdf,docx}', 'contracts/**']);
	assert.deepEqual(globList(''), []);
});

test('Simplify keeps context the user asked for', () => {
	const { simplifyResult } = require('../dist/nodes/CaptainFileSearch/actions');
	const out = simplifyResult({
		text: 't',
		score: 1,
		document: { id: 'd' },
		neighboring_chunks: [{ text: 'n' }],
	});
	assert.deepEqual(out.neighboring_chunks, [{ text: 'n' }]);
	assert.equal(out.regions, undefined);
});

test('every operation names its object, not just a verb', () => {
	const { properties } = new CaptainFileSearch().description;
	const bare = properties
		.filter((p) => p.name === 'operation')
		.flatMap((p) => p.options)
		.filter(
			(o) =>
				o.name.trim().split(/\s+/).length < 2 ||
				/^(Get|Delete|Update|Create|Copy|Cancel|Get Many|Delete All|Run Now)$/.test(o.name),
		);
	assert.deepEqual(
		bare.map((o) => o.name),
		[],
	);
});

test('placeholders that show example values start with e.g.', () => {
	const { properties } = new CaptainFileSearch().description;
	const walk = (props) =>
		props.flatMap((p) => [
			p,
			...walk(p.options?.filter((o) => o.displayName) ?? []),
			...walk(p.values ?? []),
			...(p.options?.flatMap((o) => walk(o.values ?? [])) ?? []),
		]);
	const bad = walk(properties)
		.filter((p) => typeof p.placeholder === 'string' && !/^(e\.g\. |Add )/.test(p.placeholder))
		.map((p) => `${p.displayName}: ${p.placeholder}`);
	assert.deepEqual(bad, []);
});

test('simplifyJob reads both the job detail and the job list shapes', () => {
	const { simplifyJob } = require('../dist/nodes/CaptainFileSearch/actions');
	const fromList = simplifyJob({
		job_id: 'j1',
		status: 'failed',
		files_total: 3,
		files_indexed: 2,
		files_failed: 1,
		error: 'one file was unreadable',
		finished_at: '2026-10-28T18:00:00Z',
	});
	assert.deepEqual(
		[
			fromList.files_total,
			fromList.files_indexed,
			fromList.files_failed,
			fromList.error,
			fromList.finished_at,
		],
		[3, 2, 1, 'one file was unreadable', '2026-10-28T18:00:00Z'],
	);
	const fromDetail = simplifyJob({
		job_id: 'j2',
		status: 'completed',
		progress: { files_total: 4 },
		result: { files_indexed: 4, files_failed: 0 },
		completed_at: '2026-10-28T19:00:00Z',
	});
	assert.deepEqual(
		[
			fromDetail.files_total,
			fromDetail.files_indexed,
			fromDetail.files_failed,
			fromDetail.finished_at,
		],
		[4, 4, 0, '2026-10-28T19:00:00Z'],
	);
});

/** A minimal n8n execution context: parameters from a map, HTTP calls answered by a handler. */
function fakeContext(params, handle) {
	const calls = [];
	return {
		calls,
		getNode: () => ({
			name: 'Captain File Search',
			type: '@captain-sdk/n8n-nodes-filesearch.captainFileSearch',
			typeVersion: 1,
			parameters: {},
		}),
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ apiKey: 'test', baseUrl: 'https://api.example.test' }),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (_cred, options) => {
				calls.push(`${options.method} ${options.url}`);
				return handle(options);
			},
			httpRequest: async (options) => {
				calls.push(`${options.method} ${options.url}`);
				return handle(options);
			},
		},
	};
}

test('parse results over 1 MB are fetched from result_url and split into chunks', async () => {
	const { runOperation } = require('../dist/nodes/CaptainFileSearch/actions');
	const ctx = fakeContext(
		{
			parseType: 'documents',
			inputType: 'url',
			fileUrl: 'https://example.com/big.pdf',
			processingType: 'basic',
			options: {},
			waitForCompletion: true,
			waitTimeout: 60,
			output: 'split',
		},
		(options) => {
			if (options.method === 'POST') return { job_id: 'prs_1', status: 'queued' };
			if (options.url.endsWith('/v3/parse/jobs/prs_1'))
				return {
					job_id: 'prs_1',
					status: 'completed',
					chunks: null,
					result_url: 'https://results.example.test/prs_1.json',
				};
			if (options.url === 'https://results.example.test/prs_1.json')
				return { chunks: [{ text: 'first' }, { text: 'second' }] };
			throw new Error(`unexpected request ${options.method} ${options.url}`);
		},
	);
	const items = await runOperation.call(ctx, 'parse', 'parse', 0);
	assert.deepEqual(
		items.map((item) => item.json),
		[
			{ job_id: 'prs_1', text: 'first' },
			{ job_id: 'prs_1', text: 'second' },
		],
	);
	assert.ok(ctx.calls.includes('GET https://results.example.test/prs_1.json'));
});

test('parse results that fit inline are not downloaded again', async () => {
	const { runOperation } = require('../dist/nodes/CaptainFileSearch/actions');
	const ctx = fakeContext(
		{
			parseType: 'documents',
			inputType: 'url',
			fileUrl: 'https://example.com/s.pdf',
			processingType: 'basic',
			options: {},
			waitForCompletion: true,
			waitTimeout: 60,
			output: 'split',
		},
		(options) => {
			if (options.method === 'POST') return { job_id: 'prs_2', status: 'queued' };
			return {
				job_id: 'prs_2',
				status: 'completed',
				chunks: [{ text: 'only' }],
				result_url: 'https://results.example.test/prs_2.json',
			};
		},
	);
	const items = await runOperation.call(ctx, 'parse', 'parse', 0);
	assert.equal(items.length, 1);
	assert.ok(!ctx.calls.some((c) => c.includes('results.example.test')));
});

test('Search Collection fills the Collection field when it is selected', async () => {
	const { runOperation } = require('../dist/nodes/CaptainFileSearch/actions');
	const ctx = fakeContext(
		{
			query: 'q',
			maxResults: 1,
			output: 'selected',
			fields: ['collection', 'text'],
			options: {},
			collection: 'contracts',
		},
		() => ({ results: [{ chunk_id: 'c1', text: 't', score: 1, document: { id: 'd1' } }] }),
	);
	const [item] = await runOperation.call(ctx, 'search', 'query', 0);
	assert.deepEqual(item.json, {
		collection: 'contracts',
		text: 't',
		chunk_id: 'c1',
		document_id: 'd1',
	});
});

test('JSON fields show their example as a visible hint, because n8n JSON editors hide placeholders', () => {
	const { properties } = new CaptainFileSearch().description;
	const jsonFields = properties
		.flatMap((p) => [p, ...(p.options ?? [])])
		.filter((p) => p.type === 'json');
	assert.ok(jsonFields.length >= 2);
	for (const field of jsonFields) assert.match(field.hint ?? '', /^e\.g\. /, field.displayName);
});

test('simplifyJob never reports processed files as indexed', () => {
	const { simplifyJob } = require('../dist/nodes/CaptainFileSearch/actions');
	const cancelled = simplifyJob({
		job_id: 'j3',
		status: 'cancelled',
		progress: { files_total: 4, files_processed: 4, files_failed: 1, files_skipped: 1 },
	});
	assert.equal(cancelled.files_indexed, undefined);
	assert.equal(cancelled.files_failed, 1);
});

test('SigV4 matches the AWS documentation example for List Objects', () => {
	const { sigV4Headers } = require('../dist/nodes/CaptainFileSearch/storage/signing');
	// "GET Bucket (List Objects)" example from the S3 Signature Version 4 documentation.
	const headers = sigV4Headers(
		'GET',
		'https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J',
		'us-east-1',
		'AKIAIOSFODNN7EXAMPLE',
		'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
		new Date('2013-05-24T00:00:00Z'),
	);
	assert.match(
		headers.Authorization,
		/Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/,
	);
});

test('s3Url encodes paths and sorts the query the way SigV4 signs it', () => {
	const { s3Url, regionFromHost } = require('../dist/nodes/CaptainFileSearch/storage/signing');
	assert.equal(
		s3Url('https://s3.us-east-1.amazonaws.com', '/my bucket', {
			prefix: 'a b/',
			'list-type': '2',
			marker: undefined,
		}),
		'https://s3.us-east-1.amazonaws.com/my%20bucket?list-type=2&prefix=a%20b%2F',
	);
	assert.equal(regionFromHost('s3.eu-west-2.amazonaws.com', 'x'), 'eu-west-2');
	assert.equal(regionFromHost('s3.amazonaws.com', 'x'), 'us-east-1');
	assert.equal(regionFromHost('acct.r2.cloudflarestorage.com', 'x'), 'auto');
	assert.equal(regionFromHost('s3.us-west-004.backblazeb2.com', 'x'), 'us-west-004');
	assert.equal(regionFromHost('ref.storage.supabase.co', 'ap-south-1'), 'ap-south-1');
});

test('the Google service account JWT verifies with the matching public key', () => {
	const { generateKeyPairSync, createVerify } = require('node:crypto');
	const { googleJwtAssertion } = require('../dist/nodes/CaptainFileSearch/storage/signing');
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const jwt = googleJwtAssertion(
		'sa@project.iam.gserviceaccount.com',
		privateKey.export({ type: 'pkcs8', format: 'pem' }),
		'https://www.googleapis.com/auth/drive.readonly',
		'nathan@example.com',
		1_800_000_000,
	);
	const [header, claims, signature] = jwt.split('.');
	const ok = createVerify('RSA-SHA256')
		.update(`${header}.${claims}`)
		.verify(publicKey, Buffer.from(signature, 'base64url'));
	assert.equal(ok, true);
	const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
	assert.equal(body.sub, 'nathan@example.com');
	assert.equal(body.exp - body.iat, 3600);
});

test('xmlValues reads S3 and Azure list responses', () => {
	const { xmlValues } = require('../dist/nodes/CaptainFileSearch/storage/signing');
	const s3 =
		'<ListBucketResult><CommonPrefixes><Prefix>a/</Prefix></CommonPrefixes><Contents><Key>a/b &amp; c.pdf</Key></Contents><NextContinuationToken>t1</NextContinuationToken></ListBucketResult>';
	assert.deepEqual(xmlValues(s3, 'Prefix', 'CommonPrefixes'), ['a/']);
	assert.deepEqual(xmlValues(s3, 'Key', 'Contents'), ['a/b & c.pdf']);
	const azure =
		'<EnumerationResults><Blobs><BlobPrefix><Name>docs/</Name></BlobPrefix><Blob><Name>x.pdf</Name></Blob></Blobs></EnumerationResults>';
	assert.deepEqual(xmlValues(azure, 'Name', 'BlobPrefix'), ['docs/']);
	assert.deepEqual(xmlValues(azure, 'Name', 'Blob'), ['x.pdf']);
});

/** A load-options context that answers each request with the next canned response. */
function listContext(params, responses, credentials = {}) {
	const calls = [];
	return {
		calls,
		getCurrentNodeParameter: (name) => params[name],
		getNode: () => ({ name: 'Captain File Search' }),
		getCredentials: async () => ({ baseUrl: 'https://api.example.com', ...credentials }),
		helpers: {
			httpRequestWithAuthentication: async (_credential, options) => {
				calls.push(options);
				return responses.shift();
			},
		},
	};
}

test('OneDrive users are picked by principal name and the list pages through Graph', async () => {
	const { searchMicrosoftUsers } = require('../dist/nodes/CaptainFileSearch/storage/browse');
	const next = 'https://graph.microsoft.com/v1.0/users?$skiptoken=abc';
	const ctx = listContext({ operation: 'onedrive' }, [
		{
			value: [{ displayName: 'Ana', mail: 'ana@sales.example.com', userPrincipalName: 'ana@example.com' }],
			'@odata.nextLink': next,
		},
		{ value: [{ displayName: 'Bo', userPrincipalName: 'bo@example.com' }] },
	]);
	const first = await searchMicrosoftUsers.call(ctx);
	assert.equal(first.results[0].value, 'ana@example.com');
	assert.match(first.results[0].name, /ana@sales\.example\.com/);
	assert.equal(first.paginationToken, next);
	const second = await searchMicrosoftUsers.call(ctx, undefined, first.paginationToken);
	assert.equal(ctx.calls[1].url, next);
	assert.equal(second.results[0].value, 'bo@example.com');
	assert.equal(second.paginationToken, undefined);
});

test('bucket, site, library and Dropbox search dropdowns return a next-page token', async () => {
	const browse = require('../dist/nodes/CaptainFileSearch/storage/browse');
	const azure = listContext({ operation: 'azure' }, [
		'<Containers><Container><Name>a</Name></Container></Containers><NextMarker>m2</NextMarker>',
	], { accountName: 'acct' });
	assert.equal((await browse.searchBuckets.call(azure)).paginationToken, 'm2');
	const gcs = listContext({ operation: 'gcs' }, [{ items: [{ name: 'b' }], nextPageToken: 't2' }], {
		serviceAccountJson: '{"project_id":"p"}',
	});
	assert.equal((await browse.searchBuckets.call(gcs)).paginationToken, 't2');
	const sites = listContext({ operation: 'sharepoint' }, [
		{ value: [{ webUrl: 'https://x.sharepoint.com/sites/a' }], '@odata.nextLink': 'n1' },
	]);
	assert.equal((await browse.searchSharePointSites.call(sites)).paginationToken, 'n1');
	const libraries = listContext({ operation: 'sharepoint', siteUrl: 'https://x.sharepoint.com/sites/a' }, [
		{ value: [{ id: 'd', name: 'Documents' }], '@odata.nextLink': 'n2' },
	]);
	assert.equal((await browse.searchSharePointLibraries.call(libraries)).paginationToken, 'n2');
	const dropbox = listContext({ operation: 'dropbox' }, [
		{ matches: [{ metadata: { metadata: { '.tag': 'file', path_display: '/a.pdf' } } }], has_more: true, cursor: 'c1' },
		{ matches: [], has_more: false },
	]);
	const page = await browse.searchDropboxFiles.call(dropbox, 'a');
	assert.equal(page.paginationToken, 'search:c1');
	await browse.searchDropboxFiles.call(dropbox, 'a', page.paginationToken);
	assert.match(dropbox.calls[1].url, /files\/search\/continue_v2$/);
	assert.deepEqual(dropbox.calls[1].body, { cursor: 'c1' });
});

test('the metadata Field dropdown reads every page of documents', async () => {
	const { getMetadataFields } = require('../dist/nodes/CaptainFileSearch/GenericFunctions');
	const full = Array.from({ length: 1000 }, () => ({ custom_metadata: { department: 'legal' } }));
	const ctx = listContext({ collection: 'contracts' }, [
		{ documents: full, total_count: 1001 },
		{ documents: [{ custom_metadata: { year: 2024 } }], total_count: 1001 },
	]);
	const fields = await getMetadataFields.call(ctx);
	assert.deepEqual(fields.map((f) => f.value), ['department', 'year']);
	assert.equal(ctx.calls[1].qs.offset, 1000);
});

test('region and language lists cover what the API accepts, with a typed region fallback', () => {
	const { AWS_REGIONS, AWS_REGION_CHOICES, TRANSCRIPTION_LANGUAGES } = require('../dist/nodes/CaptainFileSearch/storage/lists');
	const { credentialRegion } = require('../dist/nodes/CaptainFileSearch/storage/signing');
	assert.ok(AWS_REGIONS.some((r) => r.value === 'ca-west-1'));
	assert.equal(AWS_REGION_CHOICES.at(-1).value, 'other');
	assert.equal(credentialRegion({ region: 'other', customRegion: ' xx-new-1 ' }), 'xx-new-1');
	assert.equal(credentialRegion({ region: 'eu-west-1' }), 'eu-west-1');
	assert.equal(credentialRegion({}), 'us-east-1');
	// The API's TRANSCRIBE_LANGUAGE_CODES has 103 codes; each must be selectable.
	const codes = TRANSCRIPTION_LANGUAGES.map((l) => l.value).filter(Boolean);
	assert.equal(new Set(codes).size, 103);
	for (const code of ['fi-FI', 'cs-CZ', 'no-NO']) assert.ok(codes.includes(code), code);
});

test('the metadata Field dropdown works on Search Multiple Collections and joins every collection', async () => {
	const { getMetadataFields } = require('../dist/nodes/CaptainFileSearch/GenericFunctions');
	const ctx = listContext({}, [
		{ documents: [{ custom_metadata: { department: 'legal' } }], total_count: 1 },
		{ documents: [{ custom_metadata: { region: 'emea' } }], total_count: 1 },
	]);
	// n8n throws for a parameter the action doesn't have, as it does for 'collection' here.
	ctx.getCurrentNodeParameter = (name) => {
		if (name === 'collections') return ['contracts', 'policies'];
		throw new Error('Could not find property');
	};
	const fields = await getMetadataFields.call(ctx);
	assert.deepEqual(fields.map((f) => f.value), ['department', 'region']);
	assert.match(ctx.calls[1].url, /\/collections\/policies\/documents$/);
});

test('storage listing errors say what to fix, never a library code or stack', () => {
	const { listingError } = require('../dist/nodes/CaptainFileSearch/storage/browse');
	const cases = [
		['gcs', { code: 'ERR_OSSL_UNSUPPORTED', message: 'error:1E08010C:DECODER routines::unsupported' }, /private key/, /Service Account JSON/],
		['gdrive', { code: 'ERR_OSSL_UNSUPPORTED', message: 'error:1E08010C:DECODER routines::unsupported' }, /private key/, /Service Account JSON/],
		['r2', { code: 'EPROTO', message: 'write EPROTO A8DB57B7FFFF0000:error:0A000410:SSL routines' }, /reach/, /Account ID/],
		['azure', { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND fake.blob.core.windows.net' }, /reach/, /Account Name/],
		['supabase', { httpCode: '400', message: 'Bad request - please check your parameters' }, /refused/, /Endpoint URL/],
		['backblaze', { httpCode: '403', message: 'Forbidden' }, /rejected/, /Application Key/],
		['dropbox', { httpCode: '401', message: 'Unauthorized' }, /rejected/, /access token/],
	];
	for (const [source, error, message, description] of cases) {
		const out = listingError(source, error);
		assert.match(out.message, message, source);
		assert.match(out.description, description, source);
		assert.doesNotMatch(out.message + out.description, /ERR_|EPROTO|ENOTFOUND|undefined|openssl|routines/, source);
	}
	const microsoft = 'Microsoft did not accept these values. Check the tenant ID and client ID, and that the client secret has not expired.';
	// n8n's picker shows only the message, so the fix and the way out must be in it.
	assert.match(listingError('sharepoint', new Error(microsoft)).message, /tenant ID.*other mode/);
	for (const [source, error] of cases) {
		assert.match(listingError(source, error).message, /Check|Paste/, source);
		assert.match(listingError(source, error).message, /other mode/, source);
	}
});

test('a batch search separates passages, collections missing a filtered field, and real failures', () => {
	const { batchResults } = require('../dist/nodes/CaptainFileSearch/actions');
	const missing = {
		collection: 'a',
		status: 'failed',
		error: { status_code: 400, message: 'Invalid metadata filter — "region" is not a filterable attribute in this collection.' },
	};
	const hit = { collection: 'b', status: 'succeeded', results: [{ chunk_id: 'c1', document_id: 'd1', text: 'EMEA terms', score: 0.9 }] };
	const broken = { collection: 'c', status: 'failed', error: { status_code: 500, message: 'Search backend unavailable' } };
	const out = batchResults({ results: [missing, hit, broken] }, 'simplified', []);
	assert.equal(out.items.length, 1);
	assert.equal(out.items[0].text, 'EMEA terms');
	assert.deepEqual(out.missing.map((m) => [m.index, m.collection, m.field]), [[0, 'a', 'region']]);
	assert.deepEqual(out.failures.map((f) => f.collection), ['c']);
});

test('withoutField keeps "any condition" matches and drops only what the missing field decides', () => {
	const { withoutField, missingField } = require('../dist/nodes/CaptainFileSearch/actions');
	const legal = { department: { $eq: 'legal' } };
	// Greptile's case: department = legal OR region = emea still matches legal documents.
	assert.deepEqual(withoutField({ $or: [legal, { region: { $eq: 'emea' } }] }, 'region'), legal);
	// All conditions required: the missing field can't match, so nothing in the collection can.
	assert.equal(withoutField({ $and: [legal, { region: { $eq: 'emea' } }] }, 'region'), false);
	assert.equal(withoutField({ region: { $eq: 'emea' } }, 'region'), false);
	assert.equal(withoutField({ region: 'emea' }, 'region'), false);
	assert.equal(withoutField({ region: { $in: ['emea', 'apac'] } }, 'region'), false);
	// Not Equals and Not In match documents without the field.
	assert.equal(withoutField({ region: { $ne: 'emea' } }, 'region'), true);
	assert.deepEqual(withoutField({ $and: [legal, { region: { $nin: ['emea'] } }] }, 'region'), legal);
	assert.equal(withoutField({ $or: [legal, { region: { $ne: 'emea' } }] }, 'region'), true);
	assert.equal(withoutField({ region: { $exists: false } }, 'region'), true);
	assert.equal(withoutField({ region: { $exists: true } }, 'region'), false);
	// The builder ANDs Advanced Filter (JSON) with its conditions.
	assert.deepEqual(
		withoutField({ $and: [{ $or: [legal, { region: { $eq: 'emea' } }] }, { year: { $gte: 2024 } }] }, 'region'),
		{ $and: [legal, { year: { $gte: 2024 } }] },
	);
	// A missing field reads as null, as the search index reads it (Greptile on 021331b).
	assert.equal(withoutField({ region: { $ne: null } }, 'region'), false);
	assert.deepEqual(withoutField({ $or: [legal, { region: { $ne: null } }] }, 'region'), legal);
	assert.equal(withoutField({ region: { $eq: null } }, 'region'), true);
	assert.equal(withoutField({ region: null }, 'region'), true);
	// The search index rejects null inside $in and $nin lists, so the error stays visible.
	assert.equal(withoutField({ region: { $in: ['emea', null] } }, 'region'), null);
	assert.equal(withoutField({ region: { $nin: ['emea', null] } }, 'region'), null);
	assert.equal(withoutField({ region: { $gt: null } }, 'region'), null);
	assert.equal(withoutField({ year: { $gte: 2024, $lte: 2025 } }, 'year'), false);
	// Unknown operators keep the error visible instead of guessing.
	assert.equal(withoutField({ region: { $regex: 'e.*' } }, 'region'), null);
	assert.equal(withoutField({ $not: legal }, 'region'), null);
	assert.equal(missingField('Invalid metadata filter — "region" is not a filterable attribute in this collection.'), 'region');
	assert.equal(missingField('Invalid metadata filter — the attribute may not exist or is not filterable in this collection'), undefined);
});

test('caption languages cover Finnish, Czech and Norwegian, with an automatic choice', () => {
	const { CAPTION_LANGUAGES } = require('../dist/nodes/CaptainFileSearch/storage/lists');
	const codes = CAPTION_LANGUAGES.map((l) => l.value);
	for (const code of ['auto', 'fi', 'cs', 'no', 'en']) assert.ok(codes.includes(code), code);
	// YouTube takes two-letter codes; locale codes like fi-FI belong to the audio list only.
	assert.ok(codes.filter((c) => c !== 'auto').every((c) => /^[a-z]{2}$/.test(c)));
});

test('Backblaze needs only a region and key; the endpoint follows the region', () => {
	const { CaptainBackblazeB2Api } = require('../dist/credentials/CaptainBackblazeB2Api.credentials');
	const names = new CaptainBackblazeB2Api().properties.map((p) => p.name);
	assert.ok(!names.includes('endpointUrl'));
	assert.ok(names.includes('region'));
});
