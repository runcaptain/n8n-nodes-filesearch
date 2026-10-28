import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export const CREDENTIAL = 'captainFileSearchApi';

type Context = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

export const TERMINAL_JOB_STATUSES = [
	'completed',
	'completed_with_errors',
	'failed',
	'cancelled',
	'timed_out',
];

const TERMINAL_PARSE_STATUSES = ['completed', 'failed', 'cancelled'];

async function baseUrl(this: Context): Promise<string> {
	const credentials = await this.getCredentials(CREDENTIAL);
	return String(credentials.baseUrl || 'https://api.filesearch.dev').replace(/\/+$/, '');
}

/**
 * The API reports errors as {"message": "..."}, {"detail": "..."} or {"detail": [{"msg": ...}]};
 * surface that text instead of n8n's generic "Bad request" line.
 */
function apiErrorMessage(error: JsonObject): string | undefined {
	const cause = (error.cause ?? {}) as JsonObject;
	const response = (error.response ?? cause.response ?? {}) as JsonObject;
	const raw = response.body ?? response.data ?? error.body ?? cause.body;
	const body = (Buffer.isBuffer(raw) ? raw.toString('utf8') : raw) as
		| JsonObject
		| string
		| undefined;
	const parsed = typeof body === 'string' ? safeJson(body) : body;
	const message = (parsed as JsonObject | undefined)?.message;
	const detail = (parsed as JsonObject | undefined)?.detail;
	if (typeof detail === 'string') return detail;
	if (Array.isArray(detail)) {
		return detail
			.map((d) => {
				const entry = d as JsonObject;
				const loc = Array.isArray(entry.loc) ? entry.loc.filter((l) => l !== 'body').join('.') : '';
				return loc ? `${loc}: ${String(entry.msg)}` : String(entry.msg);
			})
			.join('; ');
	}
	if (detail && typeof detail === 'object') {
		const d = detail as JsonObject;
		return String(d.message ?? d.error ?? JSON.stringify(d));
	}
	if (typeof message === 'string' && message) return message;
	return undefined;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** The next step to suggest under an API message, by HTTP status (n8n's errors guideline). */
function howToFix(status: number): string {
	if (status === 401 || status === 403)
		return "Check the API key in the 'Captain File Search API' credential, and that it has access to this collection";
	if (status === 404)
		return 'Check the collection, document, job or sync named in the message. Pick it from the list to be sure it exists.';
	if (status === 409) return 'Something with this name already exists. Choose another name.';
	if (status === 400 || status === 422)
		return 'Change the parameter named in the message and run the node again';
	if (status === 429) return 'Too many requests at once. Wait a moment and run the node again.';
	if (status >= 500)
		return 'File Search could not complete the request. Run the node again, and contact support@runcaptain.com if it keeps happening.';
	return 'Check the node parameters and run it again';
}

export async function apiRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject | Buffer,
	qs: IDataObject = {},
	extra: Partial<IHttpRequestOptions> = {},
	itemIndex?: number,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const options: IHttpRequestOptions = {
		method,
		url: `${await baseUrl.call(this)}${path}`,
		qs: dropEmpty(qs),
		json: !Buffer.isBuffer(body),
		...extra,
	};
	if (body !== undefined) options.body = body;
	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL, options);
	} catch (error) {
		// httpRequestWithAuthentication already throws a NodeApiError with the response body in
		// context.data, and re-wrapping returns that same object, so set the API's message on it.
		const data = (error as NodeApiError).context?.data as JsonObject | undefined;
		const message =
			apiErrorMessage(error as JsonObject) ??
			(data ? apiErrorMessage({ response: { data } } as unknown as JsonObject) : undefined);
		if (error instanceof NodeApiError && message) {
			error.message = message;
			error.description = howToFix(Number(error.httpCode));
			if (itemIndex !== undefined) error.context.itemIndex = itemIndex;
			throw asNodeError(this.getNode(), error, itemIndex);
		}
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			...(message
				? { message, description: howToFix(Number((error as JsonObject).httpCode)) }
				: {}),
			...(itemIndex !== undefined ? { itemIndex } : {}),
		});
	}
}

/** Offset-paginated list endpoints: collections, documents, jobs. */
export async function apiRequestAllItems(
	this: IExecuteFunctions,
	path: string,
	key: string,
	qs: IDataObject,
	limit: number | undefined,
	itemIndex: number,
	pageSize = 100,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	let offset = 0;
	for (;;) {
		const size = limit === undefined ? pageSize : Math.min(pageSize, limit - results.length);
		const page = (await apiRequest.call(
			this,
			'GET',
			path,
			undefined,
			{ ...qs, limit: size, offset },
			{},
			itemIndex,
		)) as IDataObject;
		const rows = (page[key] as IDataObject[] | undefined) ?? [];
		results.push(...rows);
		offset += rows.length;
		const total = page.total_count as number | undefined;
		if (rows.length < size) break;
		if (limit !== undefined && results.length >= limit) break;
		if (total !== undefined && offset >= total) break;
	}
	return limit === undefined ? results : results.slice(0, limit);
}

export function dropEmpty(obj: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined || v === null || v === '') continue;
		if (Array.isArray(v) && v.length === 0) continue;
		out[k] = v;
	}
	return out;
}

export function collectionName(
	this: IExecuteFunctions,
	itemIndex: number,
	param = 'collection',
): string {
	const value = this.getNodeParameter(param, itemIndex, '', { extractValue: true }) as string;
	const name = String(value ?? '').trim();
	if (!name) {
		throw new NodeOperationError(this.getNode(), "'Collection' is empty", {
			itemIndex,
			description: 'Pick a collection from the list, or switch to By Name and type its name',
		});
	}
	return encodeURIComponent(name);
}

export function parseJsonParameter(
	this: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): IDataObject | IDataObject[] | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'object') return value as IDataObject;
	const text = String(value).trim();
	if (!text || text === '{}' || text === '[]') return undefined;
	try {
		return JSON.parse(text) as IDataObject;
	} catch {
		throw new NodeOperationError(this.getNode(), `'${label}' is not valid JSON`, {
			itemIndex,
			description:
				'Check for missing quotes, commas or braces, e.g. {"department": {"$eq": "legal"}}',
		});
	}
}

/** Key/value pairs from a fixedCollection, keeping non-string expression results as they are. */
export function keyValuePairs(input: IDataObject | undefined): IDataObject | undefined {
	const pairs = (input?.values as IDataObject[] | undefined) ?? [];
	if (!pairs.length) return undefined;
	const out: IDataObject = {};
	for (const pair of pairs) {
		const key = String(pair.key ?? '').trim();
		if (key) out[key] = pair.value as IDataObject[keyof IDataObject];
	}
	return Object.keys(out).length ? out : undefined;
}

export async function waitForJob(
	this: IExecuteFunctions,
	jobId: string,
	timeoutSeconds: number,
	itemIndex: number,
): Promise<IDataObject> {
	const deadline = Date.now() + timeoutSeconds * 1000;
	let delay = 2000;
	for (;;) {
		const job = (await apiRequest.call(
			this,
			'GET',
			`/v2/jobs/${encodeURIComponent(jobId)}`,
			undefined,
			{},
			{},
			itemIndex,
		)) as IDataObject;
		if (TERMINAL_JOB_STATUSES.includes(String(job.status))) return job;
		if (Date.now() + delay > deadline) {
			return { ...job, wait_timed_out: true };
		}
		await sleep(delay);
		delay = Math.min(delay * 1.5, 15000);
	}
}

export async function waitForParseJob(
	this: IExecuteFunctions,
	jobId: string,
	timeoutSeconds: number,
	itemIndex: number,
): Promise<IDataObject> {
	const deadline = Date.now() + timeoutSeconds * 1000;
	for (;;) {
		const remaining = Math.floor((deadline - Date.now()) / 1000);
		const wait = Math.max(0, Math.min(50, remaining));
		const job = (await apiRequest.call(
			this,
			'GET',
			`/v3/parse/jobs/${encodeURIComponent(jobId)}`,
			undefined,
			{ wait },
			{},
			itemIndex,
		)) as IDataObject;
		if (TERMINAL_PARSE_STATUSES.includes(String(job.status))) return job;
		if (Date.now() >= deadline) return { ...job, wait_timed_out: true };
	}
}

export interface MultipartFile {
	field: string;
	filename: string;
	contentType: string;
	data: Buffer;
}

/** Build a multipart/form-data body by hand; verified n8n nodes cannot ship a form-data dependency. */
export function buildMultipart(
	fields: IDataObject,
	files: MultipartFile[],
): { body: Buffer; contentType: string } {
	const boundary = `----n8nCaptain${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	const chunks: Buffer[] = [];
	const quote = (s: string) =>
		s
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/[\r\n]/g, ' ');
	for (const [name, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === '') continue;
		const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
		chunks.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${quote(name)}"\r\n\r\n${text}\r\n`,
			),
		);
	}
	for (const file of files) {
		chunks.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${quote(file.field)}"; filename="${quote(file.filename)}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
			),
		);
		chunks.push(file.data);
		chunks.push(Buffer.from('\r\n'));
	}
	chunks.push(Buffer.from(`--${boundary}--\r\n`));
	return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

export async function searchCollections(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const all: IDataObject[] = [];
	let offset = 0;
	for (;;) {
		const page = (await apiRequest.call(this, 'GET', '/v2/collections', undefined, {
			limit: 100,
			offset,
		})) as IDataObject;
		const rows = (page.collections as IDataObject[] | undefined) ?? [];
		all.push(...rows);
		offset += rows.length;
		if (rows.length < 100 || offset >= Number(page.total_count ?? 0) || offset >= 1000) break;
	}
	const needle = (filter ?? '').toLowerCase();
	return {
		results: all
			.map((c) => String(c.collection_name))
			.filter((name) => !needle || name.toLowerCase().includes(needle))
			.sort((a, b) => a.localeCompare(b))
			.map((name) => ({ name, value: name })),
	};
}

export async function getCollectionIds(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const all: IDataObject[] = [];
	let offset = 0;
	for (;;) {
		const page = (await apiRequest.call(this, 'GET', '/v2/collections', undefined, {
			limit: 100,
			offset,
		})) as IDataObject;
		const rows = (page.collections as IDataObject[] | undefined) ?? [];
		all.push(...rows);
		offset += rows.length;
		if (rows.length < 100 || offset >= Number(page.total_count ?? 0) || offset >= 1000) break;
	}
	return all
		.map((c) => ({ name: String(c.collection_name), value: String(c.collection_id) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWebhookEventTypes(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const response = (await apiRequest.call(this, 'GET', '/v2/webhooks/event-types')) as IDataObject;
	return ((response.event_types as IDataObject[] | undefined) ?? []).map((t) => ({
		name: String(t.name),
		value: String(t.name),
		description: t.description ? String(t.description) : undefined,
	}));
}

/** Re-raise an error as an n8n error type, keeping API errors as they are. */
export function asNodeError(
	node: ReturnType<IExecuteFunctions['getNode']>,
	error: unknown,
	itemIndex?: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	return new NodeOperationError(node, error as Error, itemIndex !== undefined ? { itemIndex } : {});
}

/** Documents in the collection chosen above, newest page first, one page per "load more". */
export async function searchDocuments(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const collection = String(
		this.getCurrentNodeParameter('collection', { extractValue: true }) ?? '',
	).trim();
	if (!collection) return { results: [] };
	const offset = Number(paginationToken ?? 0);
	const page = (await apiRequest.call(
		this,
		'GET',
		`/v3/collections/${encodeURIComponent(collection)}/documents`,
		undefined,
		{ limit: 100, offset },
	)) as IDataObject;
	const rows = (page.documents as IDataObject[] | undefined) ?? [];
	const needle = (filter ?? '').toLowerCase();
	const next = offset + rows.length;
	return {
		results: rows
			.filter(
				(d) =>
					!needle ||
					String(d.filename ?? '')
						.toLowerCase()
						.includes(needle),
			)
			.map((d) => {
				const chunks = Number(d.chunk_count ?? 0);
				// n8n's list picker shows only the name, so the status and chunk count go there too.
				const detail = d.status
					? ` · ${String(d.status)}, ${chunks} ${chunks === 1 ? 'chunk' : 'chunks'}`
					: '';
				return {
					name: `${String(d.filename ?? d.document_id)}${detail}`,
					value: String(d.document_id),
				};
			}),
		paginationToken:
			rows.length === 100 && next < Number(page.total_count ?? 0) ? String(next) : undefined,
	};
}

/** Recent indexing jobs, newest first. */
export async function searchJobs(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const offset = Number(paginationToken ?? 0);
	const page = (await apiRequest.call(this, 'GET', '/v2/jobs', undefined, {
		limit: 50,
		offset,
	})) as IDataObject;
	const rows = (page.jobs as IDataObject[] | undefined) ?? [];
	const needle = (filter ?? '').toLowerCase();
	const label = (j: IDataObject) =>
		[
			j.collection_name,
			j.status,
			String(j.created_at ?? '')
				.slice(0, 16)
				.replace('T', ' '),
		]
			.filter(Boolean)
			.join(' · ');
	const next = offset + rows.length;
	return {
		results: rows
			.filter((j) => !needle || `${label(j)} ${String(j.job_id)}`.toLowerCase().includes(needle))
			.map((j) => ({ name: label(j) || String(j.job_id), value: String(j.job_id) })),
		paginationToken:
			rows.length === 50 && next < Number(page.total_count ?? 0) ? String(next) : undefined,
	};
}

/** All syncs in the organization. */
export async function searchSyncs(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = (await apiRequest.call(this, 'GET', '/v2/syncs')) as IDataObject;
	const rows = (response.connections as IDataObject[] | undefined) ?? [];
	const needle = (filter ?? '').toLowerCase();
	const label = (s: IDataObject) =>
		`${String(s.bucket ?? s.account_name ?? '')}/${String(s.prefix ?? '')} → ${String(s.collection_name)} (${String(s.status)})`;
	return {
		results: rows
			.filter((s) => !needle || label(s).toLowerCase().includes(needle))
			.map((s) => ({ name: label(s), value: String(s.sync_id) })),
	};
}
