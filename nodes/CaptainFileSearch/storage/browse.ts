import type {
	IDataObject,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { credentialRegion, s3Url, xmlValues } from './signing';

/**
 * Dropdown lists read straight from the customer's storage with the credential on the node.
 * Each list keeps a type-it-in mode, because a credential may be allowed to read a bucket but
 * not to list it.
 */

const CREDENTIAL_FOR: Record<string, string> = {
	s3: 'captainAwsS3Api',
	gcs: 'captainGoogleServiceAccountApi',
	azure: 'captainAzureBlobApi',
	r2: 'captainCloudflareR2Api',
	supabase: 'captainSupabaseStorageApi',
	backblaze: 'captainBackblazeB2Api',
	gdrive: 'captainGoogleServiceAccountApi',
	sharepoint: 'captainMicrosoft365Api',
	onedrive: 'captainMicrosoft365Api',
	dropbox: 'captainDropboxApi',
};

type Ctx = ILoadOptionsFunctions;

/** The storage source for the open action: index operations use the source name, sync ones prefix it with sync_. */
function currentSource(ctx: Ctx): string {
	return String(ctx.getCurrentNodeParameter('operation') ?? '').replace(/^sync_/, '');
}

function currentValue(ctx: Ctx, ...names: string[]): string {
	for (const name of names) {
		const value = ctx.getCurrentNodeParameter(name, { extractValue: true });
		if (value) return String(value).trim();
	}
	return '';
}

/** Credential fields to check, per source, when the storage can't be reached or rejects the key. */
const CHECK: Record<string, { reach: string; keys: string }> = {
	s3: { reach: 'the Region', keys: 'the Access Key ID and Secret Access Key' },
	r2: { reach: 'the Account ID and Jurisdiction', keys: 'the Access Key ID and Secret Access Key' },
	supabase: {
		reach: 'the Endpoint URL and Region',
		keys: 'the Access Key ID and Secret Access Key',
	},
	backblaze: { reach: 'the Region', keys: 'the Application Key ID and Application Key' },
	gcs: { reach: 'your network connection', keys: 'the Service Account JSON' },
	gdrive: { reach: 'your network connection', keys: 'the Service Account JSON and Drive user' },
	azure: { reach: 'the Account Name', keys: 'the Account Key' },
	sharepoint: { reach: 'the Tenant ID', keys: 'the Tenant ID, Client ID and Client Secret' },
	onedrive: { reach: 'the Tenant ID', keys: 'the Tenant ID, Client ID and Client Secret' },
	dropbox: { reach: 'your network connection', keys: 'the access token' },
};

const TYPE_INSTEAD = 'or switch this field to its other mode and type it.';

/**
 * A short, fixable explanation of why a storage list failed, without stack traces or library codes.
 * n8n's list picker shows only the message, not the description, so the fix is in the message.
 */
export function listingError(
	source: string,
	error: unknown,
): { message: string; description: string } {
	const e = (error ?? {}) as {
		message?: string;
		code?: string;
		httpCode?: string;
		cause?: { code?: string };
		response?: { status?: number };
	};
	const raw = String(e.message ?? '');
	const code = String(e.code ?? e.cause?.code ?? '');
	const status = Number(e.httpCode ?? e.response?.status ?? /\b([45]\d\d)\b/.exec(raw)?.[1] ?? 0);
	const check = CHECK[source] ?? { reach: 'the credential', keys: 'the credential' };
	const say = (problem: string, fix: string) => {
		const message = `${problem}. ${fix}, ${TYPE_INSTEAD}`;
		return { message, description: message };
	};
	// Messages our own credentials raise already name the fields; add the way out.
	if (
		/Listing needs an access key|Service Account JSON|did not accept|did not issue/.test(raw) &&
		!code
	) {
		const message = /type the bucket/.test(raw)
			? raw
			: `${raw.replace(/\.$/, '')}, ${TYPE_INSTEAD}`;
		return { message, description: message };
	}
	if (/^ERR_OSSL|DECODER|PEM|private key/i.test(code + ' ' + raw))
		return say(
			"The service account's private key can't be read",
			"Paste the whole JSON key file from Google Cloud into the credential's Service Account JSON",
		);
	if (
		/ENOTFOUND|EAI_AGAIN|EPROTO|ECONNREFUSED|ECONNRESET|ETIMEDOUT|CERT|SSL|TLS/i.test(
			code + ' ' + raw,
		)
	)
		return say("Couldn't reach your storage", `Check ${check.reach} in the credential`);
	if (status === 401 || status === 403)
		return say('Your storage rejected the credential', `Check ${check.keys} in the credential`);
	if (status === 404)
		return say(
			"That location wasn't found",
			'Check the bucket, container, site or folder chosen above',
		);
	if (status === 400)
		return say(
			'Your storage refused the request',
			`Check ${check.reach} and ${check.keys} in the credential`,
		);
	return say(
		"Couldn't load the list from your storage",
		`Check ${check.keys} and ${check.reach} in the credential`,
	);
}

async function request(ctx: Ctx, source: string, options: IHttpRequestOptions): Promise<unknown> {
	const credential = CREDENTIAL_FOR[source];
	try {
		return await ctx.helpers.httpRequestWithAuthentication.call(ctx, credential, options);
	} catch (error) {
		// NodeOperationError shows exactly this text. NodeApiError would replace it with the library's code.
		const { message, description } = listingError(source, error);
		throw new NodeOperationError(ctx.getNode(), message, { description });
	}
}

const needs = (ctx: Ctx, what: string) => {
	throw new NodeOperationError(ctx.getNode(), `Choose ${what} first`, {
		description: `The list shows what is inside the ${what} above`,
	});
};

const matches = (filter: string | undefined, ...texts: string[]) =>
	!filter || texts.some((t) => t.toLowerCase().includes(filter.toLowerCase()));

// ---------------------------------------------------------------- S3-compatible stores

async function s3Base(ctx: Ctx, source: string, bucket?: string): Promise<string> {
	const c = await ctx.getCredentials(CREDENTIAL_FOR[source]);
	switch (source) {
		case 's3': {
			let region = credentialRegion(c);
			if (bucket) {
				// Path-style requests must go to the bucket's own region.
				try {
					const xml = String(
						await request(ctx, source, {
							method: 'GET',
							url: s3Url('https://s3.amazonaws.com', `/${bucket}`, { location: '' }),
						}),
					);
					region = xmlValues(xml, 'LocationConstraint')[0] || 'us-east-1';
				} catch {
					// Fall back to the credential's region.
				}
			}
			return `https://s3.${region}.amazonaws.com`;
		}
		case 'r2': {
			const jurisdiction = String(c.jurisdiction ?? 'default');
			const zone = jurisdiction === 'default' ? '' : `.${jurisdiction}`;
			return `https://${String(c.accountId)}${zone}.r2.cloudflarestorage.com`;
		}
		case 'supabase':
			return String(c.endpointUrl).replace(/\/+$/, '');
		case 'backblaze':
			return (
				String(c.endpointUrl ?? '').replace(/\/+$/, '') ||
				`https://s3.${String(c.region)}.backblazeb2.com`
			);
	}
	return '';
}

async function s3Buckets(
	ctx: Ctx,
	source: string,
	filter?: string,
): Promise<INodeListSearchItems[]> {
	const xml = String(
		await request(ctx, source, { method: 'GET', url: s3Url(await s3Base(ctx, source), '/') }),
	);
	return xmlValues(xml, 'Name', 'Bucket')
		.filter((name) => matches(filter, name))
		.map((name) => ({ name, value: name }));
}

async function s3Objects(
	ctx: Ctx,
	source: string,
	bucket: string,
	prefix: string,
	folders: boolean,
	token?: string,
): Promise<{ items: string[]; next?: string }> {
	const base = await s3Base(ctx, source, bucket);
	const xml = String(
		await request(ctx, source, {
			method: 'GET',
			url: s3Url(base, `/${bucket}`, {
				'list-type': '2',
				prefix,
				delimiter: folders ? '/' : undefined,
				'max-keys': '200',
				'continuation-token': token,
			}),
		}),
	);
	const items = folders
		? xmlValues(xml, 'Prefix', 'CommonPrefixes')
		: xmlValues(xml, 'Key', 'Contents').filter((key) => !key.endsWith('/'));
	return { items, next: xmlValues(xml, 'NextContinuationToken')[0] };
}

// ---------------------------------------------------------------- Azure Blob Storage

async function azureList(
	ctx: Ctx,
	path: string,
	query: Record<string, string | undefined>,
): Promise<string> {
	const c = await ctx.getCredentials(CREDENTIAL_FOR.azure);
	const base = `https://${String(c.accountName)}.blob.core.windows.net`;
	const params = Object.entries(query)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
		.join('&');
	return String(await request(ctx, 'azure', { method: 'GET', url: `${base}${path}?${params}` }));
}

// ---------------------------------------------------------------- Google Cloud Storage

async function gcsGet(ctx: Ctx, path: string, qs: IDataObject): Promise<IDataObject> {
	return (await request(ctx, 'gcs', {
		method: 'GET',
		url: `https://storage.googleapis.com/storage/v1${path}`,
		qs,
		json: true,
	})) as IDataObject;
}

// ---------------------------------------------------------------- shared bucket, folder and file lists

const BUCKET_SOURCES = ['s3', 'r2', 'supabase', 'backblaze'];

export async function searchBuckets(
	this: Ctx,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	const source = currentSource(this);
	if (BUCKET_SOURCES.includes(source)) return { results: await s3Buckets(this, source, filter) };
	if (source === 'azure') {
		const xml = await azureList(this, '/', {
			comp: 'list',
			prefix: filter || undefined,
			maxresults: '200',
			marker: token,
		});
		return {
			results: xmlValues(xml, 'Name', 'Container').map((name) => ({ name, value: name })),
			paginationToken: xmlValues(xml, 'NextMarker')[0] || undefined,
		};
	}
	if (source === 'gcs') {
		const c = await this.getCredentials(CREDENTIAL_FOR.gcs);
		const project = (JSON.parse(String(c.serviceAccountJson)) as IDataObject).project_id;
		const page = await gcsGet(this, '/b', {
			project,
			prefix: filter || undefined,
			maxResults: 200,
			pageToken: token,
		});
		const rows = (page.items as IDataObject[] | undefined) ?? [];
		return {
			results: rows.map((b) => ({ name: String(b.name), value: String(b.name) })),
			paginationToken: page.nextPageToken ? String(page.nextPageToken) : undefined,
		};
	}
	return { results: [] };
}

async function listPaths(
	ctx: Ctx,
	folders: boolean,
	filter?: string,
	token?: string,
): Promise<{ items: string[]; next?: string }> {
	const source = currentSource(ctx);
	const bucket = currentValue(ctx, 'bucketName', 'bucket');
	if (!bucket) needs(ctx, source === 'azure' ? 'a container' : 'a bucket');
	// What the user types is a path prefix: "reports/" lists what is inside reports/.
	const prefix = (filter ?? '').replace(/^\/+/, '');
	if (BUCKET_SOURCES.includes(source))
		return s3Objects(ctx, source, bucket, prefix, folders, token);
	if (source === 'azure') {
		const xml = await azureList(ctx, `/${encodeURIComponent(bucket)}`, {
			restype: 'container',
			comp: 'list',
			prefix: prefix || undefined,
			delimiter: folders ? '/' : undefined,
			maxresults: '200',
			marker: token,
		});
		const items = folders ? xmlValues(xml, 'Name', 'BlobPrefix') : xmlValues(xml, 'Name', 'Blob');
		return { items, next: xmlValues(xml, 'NextMarker')[0] || undefined };
	}
	if (source === 'gcs') {
		const page = await gcsGet(ctx, `/b/${encodeURIComponent(bucket)}/o`, {
			prefix: prefix || undefined,
			delimiter: folders ? '/' : undefined,
			maxResults: 200,
			pageToken: token,
		});
		const items = folders
			? ((page.prefixes as string[] | undefined) ?? [])
			: ((page.items as IDataObject[] | undefined) ?? [])
					.map((o) => String(o.name))
					.filter((n) => !n.endsWith('/'));
		return { items, next: page.nextPageToken ? String(page.nextPageToken) : undefined };
	}
	return { items: [] };
}

export async function searchFolders(
	this: Ctx,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const { items, next } = await listPaths(this, true, filter, paginationToken);
	return { results: items.map((p) => ({ name: p, value: p })), paginationToken: next };
}

export async function searchFiles(
	this: Ctx,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const { items, next } = await listPaths(this, false, filter, paginationToken);
	return { results: items.map((p) => ({ name: p, value: p })), paginationToken: next };
}

export async function searchManifests(
	this: Ctx,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const { items, next } = await listPaths(this, false, filter, paginationToken);
	return {
		results: items
			.filter((p) => /\.(jsonl|ndjson|json)$/i.test(p))
			.map((p) => ({ name: p, value: p })),
		paginationToken: next,
	};
}

// ---------------------------------------------------------------- Google Drive

async function driveSearch(
	ctx: Ctx,
	folders: boolean,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	const c = await ctx.getCredentials(CREDENTIAL_FOR.gdrive);
	if (!String(c.subjectEmail ?? '').trim()) {
		throw new NodeOperationError(ctx.getNode(), 'No Google Drive user to list files for', {
			description:
				"Fill 'Google Drive User Email' in the credential, or switch to By URL or By ID and paste the link",
		});
	}
	const kind = folders
		? "mimeType = 'application/vnd.google-apps.folder'"
		: "mimeType != 'application/vnd.google-apps.folder'";
	const name = filter
		? ` and name contains '${filter.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
		: '';
	const page = (await request(ctx, 'gdrive', {
		method: 'GET',
		url: 'https://www.googleapis.com/drive/v3/files',
		qs: {
			q: `${kind} and trashed = false${name}`,
			pageSize: 100,
			pageToken: token,
			orderBy: 'modifiedTime desc',
			fields: 'nextPageToken,files(id,name,webViewLink)',
			supportsAllDrives: true,
			includeItemsFromAllDrives: true,
			corpora: 'allDrives',
		},
		json: true,
	})) as IDataObject;
	return {
		results: ((page.files as IDataObject[] | undefined) ?? []).map((f) => ({
			name: String(f.name),
			value: String(f.id),
			url: f.webViewLink ? String(f.webViewLink) : undefined,
		})),
		paginationToken: page.nextPageToken ? String(page.nextPageToken) : undefined,
	};
}

export async function searchDriveFolders(this: Ctx, filter?: string, token?: string) {
	return driveSearch(this, true, filter, token);
}

export async function searchDriveFiles(this: Ctx, filter?: string, token?: string) {
	return driveSearch(this, false, filter, token);
}

// ---------------------------------------------------------------- SharePoint and OneDrive (Microsoft Graph)

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Graph's continuation URL, used as the dropdown's pagination token. */
function nextLink(page: IDataObject): string | undefined {
	return page['@odata.nextLink'] ? String(page['@odata.nextLink']) : undefined;
}

async function graph(ctx: Ctx, url: string, qs: IDataObject = {}): Promise<IDataObject> {
	return (await request(ctx, 'sharepoint', {
		method: 'GET',
		url: url.startsWith('http') ? url : `${GRAPH}${url}`,
		qs,
		json: true,
	})) as IDataObject;
}

/** Graph path for a site given its URL (https://host/sites/Sales) or a Graph site ID. */
function sitePath(site: string): string {
	const match = /^https?:\/\/([^/]+)(\/.*)?$/.exec(site.trim());
	if (!match) return `/sites/${encodeURIComponent(site.trim())}`;
	const path = (match[2] ?? '').replace(/\/+$/, '');
	return path ? `/sites/${match[1]}:${path}:` : `/sites/${match[1]}`;
}

export async function searchSharePointSites(
	this: Ctx,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	const page = token
		? await graph(this, token)
		: await graph(this, '/sites', { search: filter || '*', $top: 100 });
	return {
		results: ((page.value as IDataObject[] | undefined) ?? []).map((s) => ({
			name: String(s.displayName || s.name || s.webUrl),
			value: String(s.webUrl),
			url: String(s.webUrl),
		})),
		paginationToken: nextLink(page),
	};
}

export async function searchSharePointLibraries(
	this: Ctx,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	const site = currentValue(this, 'siteUrl');
	if (!site) needs(this, 'a site');
	const page = token ? await graph(this, token) : await graph(this, `${sitePath(site)}/drives`);
	return {
		results: ((page.value as IDataObject[] | undefined) ?? [])
			.filter((d) => matches(filter, String(d.name)))
			.map((d) => ({
				name: String(d.name),
				value: String(d.id),
				url: d.webUrl ? String(d.webUrl) : undefined,
			})),
		paginationToken: nextLink(page),
	};
}

export async function searchMicrosoftUsers(
	this: Ctx,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	const qs: IDataObject = { $select: 'displayName,mail,userPrincipalName', $top: 100 };
	if (filter) {
		const f = filter.replace(/'/g, "''");
		qs.$filter = `startswith(displayName,'${f}') or startswith(mail,'${f}') or startswith(userPrincipalName,'${f}')`;
	}
	const page = token ? await graph(this, token) : await graph(this, '/users', qs);
	return {
		results: ((page.value as IDataObject[] | undefined) ?? []).map((u) => {
			// Graph's /users/{id}/drive takes the principal name, which can differ from the mail alias.
			const principal = String(u.userPrincipalName);
			const shown = String(u.mail || principal);
			return { name: `${String(u.displayName ?? shown)} (${shown})`, value: principal };
		}),
		paginationToken: nextLink(page),
	};
}

async function driveItems(
	ctx: Ctx,
	folders: boolean,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	let base: string;
	if (currentSource(ctx) === 'onedrive') {
		const user = currentValue(ctx, 'userEmail');
		if (!user) needs(ctx, 'a user');
		base = `/users/${encodeURIComponent(user)}/drive`;
	} else {
		const site = currentValue(ctx, 'siteUrl');
		if (!site) needs(ctx, 'a site');
		const options = (ctx.getCurrentNodeParameter('options') ?? {}) as IDataObject;
		const library = options.driveId as IDataObject | string | undefined;
		const driveId = typeof library === 'object' ? library?.value : library;
		base = driveId ? `${sitePath(site)}/drives/${String(driveId)}` : `${sitePath(site)}/drive`;
	}
	const select = { $select: 'id,name,folder,file,webUrl,parentReference', $top: 200 };
	const page = token
		? await graph(ctx, token)
		: filter
			? await graph(
					ctx,
					`${base}/root/search(q='${encodeURIComponent(filter.replace(/'/g, "''"))}')`,
					select,
				)
			: await graph(ctx, `${base}/root/children`, select);
	const where = (item: IDataObject) =>
		String(((item.parentReference ?? {}) as IDataObject).path ?? '').replace(/^.*?root:\/?/, '');
	return {
		results: ((page.value as IDataObject[] | undefined) ?? [])
			.filter((item) => (folders ? Boolean(item.folder) : Boolean(item.file)))
			.map((item) => ({
				name: where(item) ? `${where(item)}/${String(item.name)}` : String(item.name),
				value: String(item.id),
				url: item.webUrl ? String(item.webUrl) : undefined,
			})),
		paginationToken: nextLink(page),
	};
}

export async function searchMicrosoftFolders(this: Ctx, filter?: string, token?: string) {
	return driveItems(this, true, filter, token);
}

export async function searchMicrosoftFiles(this: Ctx, filter?: string, token?: string) {
	return driveItems(this, false, filter, token);
}

// ---------------------------------------------------------------- Dropbox

async function dropbox(ctx: Ctx, endpoint: string, body: IDataObject): Promise<IDataObject> {
	return (await request(ctx, 'dropbox', {
		method: 'POST',
		url: `https://api.dropboxapi.com/2/${endpoint}`,
		body,
		json: true,
	})) as IDataObject;
}

async function dropboxEntries(
	ctx: Ctx,
	folders: boolean,
	filter?: string,
	token?: string,
): Promise<INodeListSearchResult> {
	const tag = folders ? 'folder' : 'file';
	const toItem = (m: IDataObject) => ({
		name: String(m.path_display),
		value: String(m.path_display),
	});
	if (filter) {
		const page = token?.startsWith('search:')
			? await dropbox(ctx, 'files/search/continue_v2', { cursor: token.slice(7) })
			: await dropbox(ctx, 'files/search_v2', {
					query: filter,
					options: { filename_only: true, max_results: 100 },
				});
		const entries = ((page.matches as IDataObject[] | undefined) ?? []).map(
			(m) => ((m.metadata ?? {}) as IDataObject).metadata as IDataObject,
		);
		return {
			results: entries.filter((m) => m?.['.tag'] === tag).map(toItem),
			paginationToken: page.has_more && page.cursor ? `search:${String(page.cursor)}` : undefined,
		};
	}
	const page = token
		? await dropbox(ctx, 'files/list_folder/continue', { cursor: token })
		: await dropbox(ctx, 'files/list_folder', { path: '', recursive: true, limit: 200 });
	return {
		results: ((page.entries as IDataObject[] | undefined) ?? [])
			.filter((m) => m['.tag'] === tag)
			.map(toItem),
		paginationToken: page.has_more ? String(page.cursor) : undefined,
	};
}

export async function searchDropboxFolders(this: Ctx, filter?: string, token?: string) {
	return dropboxEntries(this, true, filter, token);
}

export async function searchDropboxFiles(this: Ctx, filter?: string, token?: string) {
	return dropboxEntries(this, false, filter, token);
}
