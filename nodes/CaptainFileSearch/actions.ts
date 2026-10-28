import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { SOURCES, type SourceConfig } from './descriptions/IndexDescription';
import { SYNC_STORAGES } from './descriptions/SyncDescription';
import {
	apiRequest,
	apiRequestAllItems,
	buildMultipart,
	collectionName,
	dropEmpty,
	keyValuePairs,
	parseJsonParameter,
	waitForJob,
	waitForParseJob,
	type MultipartFile,
} from './GenericFunctions';
import { credentialRegion } from './storage/signing';

type Result = IDataObject | IDataObject[];

/** The value of a pick-or-paste ID field; also accepts a plain string from older or hand-built workflows. */
function locatorValue(this: IExecuteFunctions, name: string, i: number): string {
	const value = String(this.getNodeParameter(name, i, '', { extractValue: true }) ?? '').trim();
	if (!value) {
		const labels: Record<string, string> = {
			documentId: 'Document',
			jobId: 'Job',
			syncId: 'Sync',
			bucketName: 'Bucket',
			bucket: 'Bucket',
			folderPath: 'Folder',
			filePath: 'File',
			manifestUri: 'Manifest',
			siteUrl: 'Site',
			userEmail: 'User',
			folderId: 'Folder',
			fileId: 'File',
		};
		throw new NodeOperationError(this.getNode(), `'${labels[name] ?? name}' is empty`, {
			itemIndex: i,
			description: 'Pick one from the list, or switch to the other mode and type or map a value',
		});
	}
	return value;
}

const lines = (text: string) =>
	String(text ?? '')
		.split(/[\r\n]+/)
		.map((s) => s.trim())
		.filter(Boolean);

const list = (text: unknown) =>
	String(text ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

/** Comma-separated glob patterns, keeping commas inside braces such as *.{pdf,docx}. */
export const globList = (text: unknown): string[] => {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of String(text ?? '')) {
		if (ch === '{') depth++;
		if (ch === '}') depth = Math.max(0, depth - 1);
		if (ch === ',' && depth === 0) {
			out.push(current);
			current = '';
		} else current += ch;
	}
	out.push(current);
	return out.map((s) => s.trim()).filter(Boolean);
};

function ifExistsFlags(value: unknown): IDataObject {
	if (value === 'replace') return { skip_existing: false, overwrite_existing: true };
	if (value === 'duplicate') return { skip_existing: false, overwrite_existing: false };
	return {};
}

function maskFields(options: IDataObject): IDataObject {
	if (!options.maskPii) return {};
	return dropEmpty({
		mask_pii: true,
		pii_engine: options.piiEngine,
		pii_instructions: options.piiInstructions,
	});
}

function commonIndexBody(options: IDataObject, scope?: string): IDataObject {
	return dropEmpty({
		...ifExistsFlags(options.ifExists),
		custom_metadata: keyValuePairs(options.customMetadata as IDataObject),
		parsing_script: options.parsingScript,
		transcription_language: options.transcriptionLanguage,
		source_identity: scope === 'file' ? options.sourceIdentity : undefined,
		...maskFields(options),
	});
}

/** Storage credentials become request-body fields; the bucket indexing endpoints take them inline. */
async function storageAuth(
	this: IExecuteFunctions,
	credentialName: string,
	style: 'index' | 'sync',
): Promise<IDataObject> {
	const c = await this.getCredentials(credentialName);
	switch (credentialName) {
		case 'captainAwsS3Api':
			if (style === 'sync') {
				return {
					region: credentialRegion(c),
					auth:
						c.authType === 'role'
							? { type: 'assume_role', role_arn: c.roleArn, external_id: c.externalId }
							: {
									type: 'access_key',
									access_key_id: c.accessKeyId,
									secret_access_key: c.secretAccessKey,
								},
				};
			}
			return c.authType === 'role'
				? {
						bucket_region: credentialRegion(c),
						auth: { type: 'assume_role', role_arn: c.roleArn, external_id: c.externalId },
					}
				: {
						bucket_region: credentialRegion(c),
						aws_access_key_id: c.accessKeyId,
						aws_secret_access_key: c.secretAccessKey,
					};
		case 'captainGoogleServiceAccountApi':
			return {
				service_account_json: String(c.serviceAccountJson).trim(),
				subject_email: c.subjectEmail,
			};
		case 'captainAzureBlobApi':
			return { account_name: c.accountName, account_key: c.accountKey };
		case 'captainCloudflareR2Api':
			return {
				account_id: c.accountId,
				access_key_id: c.accessKeyId,
				secret_access_key: c.secretAccessKey,
				jurisdiction: c.jurisdiction || 'default',
			};
		case 'captainSupabaseStorageApi':
		case 'captainBackblazeB2Api':
			return {
				endpoint_url:
					String(c.endpointUrl ?? '').trim() ||
					(credentialName === 'captainBackblazeB2Api'
						? `https://s3.${String(c.region)}.backblazeb2.com`
						: ''),
				region: credentialRegion(c),
				access_key_id: c.accessKeyId,
				secret_access_key: c.secretAccessKey,
			};
		case 'captainMicrosoft365Api':
			return { tenant_id: c.tenantId, client_id: c.clientId, client_secret: c.clientSecret };
		case 'captainDropboxApi':
			return { dropbox_access_token: c.accessToken };
	}
	return {};
}

/**
 * The API wants a full object URI for single files and manifests (s3://bucket/key, gs://..., the Azure blob URL).
 * Users type the path inside the bucket, so build the URI unless they already gave one.
 */
export function objectUri(source: string, bucket: string, account: unknown, path: unknown): string {
	const value = String(path ?? '').trim();
	if (/^[a-z0-9]+:\/\//i.test(value)) return value;
	const key = value.replace(/^\/+/, '');
	switch (source) {
		case 's3':
		case 'backblaze':
		case 'supabase':
			return `s3://${bucket}/${key}`;
		case 'gcs':
			return `gs://${bucket}/${key}`;
		case 'r2':
			return `r2://${bucket}/${key}`;
		case 'azure':
			return `https://${String(account)}.blob.core.windows.net/${bucket}/${key}`;
	}
	return value;
}

async function indexFromSource(
	this: IExecuteFunctions,
	source: SourceConfig,
	i: number,
): Promise<IDataObject> {
	const scope = this.getNodeParameter('scope', i) as string;
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const body: IDataObject = {
		...(await storageAuth.call(this, source.credential, 'index')),
		processing_type: this.getNodeParameter('processingType', i),
		...commonIndexBody(options, scope),
	};
	if (source.kind === 'bucket') {
		const noun = source.value === 'azure' ? 'container_name' : 'bucket_name';
		body[noun] = locatorValue.call(this, 'bucketName', i);
		if (scope === 'folder') body.directory_path = locatorValue.call(this, 'folderPath', i);
		const bucket = String(body[noun]);
		if (scope === 'file') {
			const path = locatorValue.call(this, 'filePath', i);
			body.file_uri = objectUri(source.value, bucket, body.account_name, path);
		}
		if (scope === 'manifest') {
			const path = locatorValue.call(this, 'manifestUri', i);
			body.manifest_uri = objectUri(source.value, bucket, body.account_name, path);
		}
		if (source.value === 's3' && options.bucketRegion) body.bucket_region = options.bucketRegion;
	} else {
		if (source.value === 'sharepoint') {
			body.site_url = locatorValue.call(this, 'siteUrl', i);
			const driveId = collectionFilter(options.driveId);
			if (driveId) body.drive_id = driveId;
		}
		if (source.value === 'onedrive') body.user_email = locatorValue.call(this, 'userEmail', i);
		if (source.value === 'gdrive') {
			if (options.subjectEmail) body.subject_email = options.subjectEmail;
			if (!body.subject_email) {
				throw new NodeOperationError(
					this.getNode(),
					'No Google Workspace user to read Google Drive as',
					{
						itemIndex: i,
						description:
							"Fill 'Google Drive User Email' in the credential, or add 'Drive User Email' under Options",
					},
				);
			}
		}
		if (source.value === 'dropbox') {
			if (scope === 'folder') body.directory_path = locatorValue.call(this, 'folderPath', i);
			if (scope === 'file') body.file_path = locatorValue.call(this, 'filePath', i);
		} else {
			if (scope === 'folder') body[source.folderKey!] = locatorValue.call(this, 'folderId', i);
			if (scope === 'file') body[source.fileKey!] = locatorValue.call(this, 'fileId', i);
		}
	}
	const suffix = scope === 'all' ? '' : scope === 'folder' ? '/directory' : `/${scope}`;
	if (source.kind === 'bucket') delete body.subject_email;
	return apiRequest.call(
		this,
		'POST',
		`/v2/collections/${collectionName.call(this, i)}/index/${source.path}${suffix}`,
		body,
		{},
		{},
		i,
	);
}

async function indexUploadedFiles(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const fields = list(this.getNodeParameter('binaryPropertyName', i));
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const files: MultipartFile[] = [];
	for (const field of fields) {
		const binary = this.helpers.assertBinaryData(i, field);
		files.push({
			field: 'files',
			filename: binary.fileName || `${field}.${binary.fileExtension || 'bin'}`,
			contentType: binary.mimeType || 'application/octet-stream',
			data: await this.helpers.getBinaryDataBuffer(i, field),
		});
	}
	const common = commonIndexBody(options);
	const { body, contentType } = buildMultipart(
		{
			processing_type: this.getNodeParameter('processingType', i) as string,
			...common,
			custom_metadata: common.custom_metadata ? JSON.stringify(common.custom_metadata) : undefined,
		},
		files,
	);
	return apiRequest.call(
		this,
		'POST',
		`/v2/collections/${collectionName.call(this, i)}/index/file`,
		body,
		{},
		{ headers: { 'Content-Type': contentType } },
		i,
	);
}

async function runIndex(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const collection = () => collectionName.call(this, i);
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	let started: IDataObject;
	if (operation === 'file') {
		started = await indexUploadedFiles.call(this, i);
	} else if (operation === 'url') {
		const urls = lines(this.getNodeParameter('urls', i) as string);
		started = await apiRequest.call(
			this,
			'POST',
			`/v2/collections/${collection()}/index/url`,
			{
				...(urls.length === 1 ? { url: urls[0] } : { urls }),
				processing_type: this.getNodeParameter('processingType', i),
				...commonIndexBody(options),
			},
			{},
			{},
			i,
		);
	} else if (operation === 'text') {
		started = await apiRequest.call(
			this,
			'POST',
			`/v2/collections/${collection()}/index/text`,
			{
				content: this.getNodeParameter('text', i),
				...dropEmpty({ filename: options.filename }),
				...commonIndexBody(options),
			},
			{},
			{},
			i,
		);
	} else if (operation === 'youtube') {
		const urls = lines(this.getNodeParameter('videoUrls', i) as string);
		const mode = this.getNodeParameter('youtubeMode', i) as string;
		started = await apiRequest.call(
			this,
			'POST',
			`/v2/collections/${collection()}/index/youtube`,
			{
				...(urls.length === 1 ? { url: urls[0] } : { urls }),
				mode,
				...dropEmpty({
					languages: (Array.isArray(options.languages)
						? (options.languages as string[])
						: list(options.languages)
					).filter((l) => l !== 'auto'),
					on_missing_transcript: mode === 'transcript' ? options.onMissingTranscript : undefined,
				}),
				...commonIndexBody(options),
			},
			{},
			{},
			i,
		);
	} else {
		const source = SOURCES.find((s) => s.value === operation);
		if (!source)
			throw new NodeOperationError(this.getNode(), `Unknown source "${operation}"`, {
				itemIndex: i,
			});
		started = await indexFromSource.call(this, source, i);
	}

	if (!this.getNodeParameter('waitForCompletion', i, true) || !started.job_id) return started;
	return waitForJob.call(
		this,
		String(started.job_id),
		this.getNodeParameter('waitTimeout', i, 3600) as number,
		i,
	);
}

/** Every field of a search result, flattened, so Simplified and Selected Fields can pick from one shape. */
function flattenResult(r: IDataObject, collection?: string): IDataObject {
	const doc = (r.document ?? {}) as IDataObject;
	const loc = (r.location ?? {}) as IDataObject;
	return dropEmpty({
		collection,
		text: r.text,
		score: r.score,
		rerank_score: r.rerank_score,
		filename: doc.filename,
		document_id: doc.id,
		chunk_id: r.chunk_id,
		chunk_type: r.chunk_type,
		source: doc.source,
		page_start: loc.page_start,
		page_end: loc.page_end,
		sheet_name: loc.sheet_name,
		start_seconds: loc.start_seconds,
		custom_metadata: r.custom_metadata ?? doc.custom_metadata,
		regions: r.regions,
		relations: r.relations,
		related_chunks: r.related_chunks,
		neighboring_chunks: r.neighboring_chunks,
	});
}

const SIMPLIFIED_RESULT_FIELDS = [
	'collection',
	'text',
	'score',
	'filename',
	'page_start',
	'page_end',
	'start_seconds',
	'document_id',
	'chunk_id',
	'custom_metadata',
	// Context the user asked for under Include stays in the simplified result.
	'regions',
	'relations',
	'related_chunks',
	'neighboring_chunks',
];

function pick(source: IDataObject, keys: string[]): IDataObject {
	const out: IDataObject = {};
	for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
	return out;
}

export function simplifyResult(r: IDataObject, collection?: string): IDataObject {
	return pick(flattenResult(r, collection), SIMPLIFIED_RESULT_FIELDS);
}

function shapeResult(
	r: IDataObject,
	output: string,
	fields: string[],
	collection?: string,
): IDataObject {
	if (output === 'raw') return collection ? { collection, ...r } : r;
	if (output === 'selected') {
		return pick(flattenResult(r, collection), [...fields, 'chunk_id', 'document_id']);
	}
	return simplifyResult(r, collection);
}

/** How each custom metadata field is stored in a collection, sampled from its documents. */
async function metadataTypes(
	this: IExecuteFunctions,
	collection: string,
	i: number,
): Promise<Record<string, string>> {
	const page = (await apiRequest.call(
		this,
		'GET',
		`/v3/collections/${encodeURIComponent(collection)}/documents`,
		undefined,
		{ include_custom_metadata: true, limit: 200 },
		{},
		i,
	)) as IDataObject;
	const types: Record<string, string> = {};
	for (const doc of (page.documents as IDataObject[] | undefined) ?? []) {
		for (const [key, value] of Object.entries((doc.custom_metadata ?? {}) as IDataObject)) {
			types[key] ??= Array.isArray(value) ? 'array' : typeof value;
		}
	}
	return types;
}

/** Turn the builder's text value into the type the field is stored as, so "2024" matches 2024. */
function typedValue(raw: unknown, type: string | undefined, operator: string): unknown {
	if (typeof raw !== 'string') return raw;
	const text = raw.trim();
	const numeric = /^-?\d+(\.\d+)?$/.test(text);
	const range = ['$gt', '$gte', '$lt', '$lte'].includes(operator);
	if ((type === 'number' || (range && type === undefined)) && numeric) return Number(text);
	if (type === 'boolean' && /^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
	return text;
}

/** The API filter from the Metadata Filters builder plus the Advanced Filter (JSON), joined with AND. */
async function buildMetadataFilter(
	this: IExecuteFunctions,
	options: IDataObject,
	jsonKey: string,
	collection: string,
	i: number,
): Promise<IDataObject | undefined> {
	const conditions =
		((options.metadataFilters as IDataObject | undefined)?.conditions as
			| IDataObject[]
			| undefined) ?? [];
	const parts: IDataObject[] = [];
	if (conditions.length) {
		const types = collection ? await metadataTypes.call(this, collection, i) : {};
		for (const c of conditions) {
			const field = String(c.field ?? '').trim();
			if (!field) continue;
			const operator = String(c.operator ?? '$eq');
			const type = types[field];
			const value = ['$in', '$nin'].includes(operator)
				? list(c.value).map((v) => typedValue(v, type, '$eq'))
				: typedValue(c.value, type, operator);
			parts.push({ [field]: { [operator]: value } });
		}
	}
	const json = parseJsonParameter.call(this, options[jsonKey], 'Advanced Filter (JSON)', i) as
		| IDataObject
		| undefined;
	const built =
		parts.length > 1
			? { [String(options.metadataMatch ?? '$and')]: parts }
			: parts.length === 1
				? parts[0]
				: undefined;
	if (built && json) return { $and: [built, json] };
	return built ?? json;
}

async function searchBody(
	this: IExecuteFunctions,
	i: number,
	collection: string,
): Promise<IDataObject> {
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const include: IDataObject = {};
	for (const key of (options.include as string[] | undefined) ?? []) include[key] = true;
	return dropEmpty({
		limit: this.getNodeParameter('maxResults', i),
		filter: await buildMetadataFilter.call(this, options, 'filter', collection, i),
		rerank: options.rerank,
		semantic_ratio: options.semanticRatio,
		max_chunks_per_document: options.maxChunksPerDocument,
		exclude_chunk_types: options.excludeChunkTypes,
		include: Object.keys(include).length ? include : undefined,
	});
}

async function runSearch(this: IExecuteFunctions, operation: string, i: number): Promise<Result> {
	const query = this.getNodeParameter('query', i) as string;
	const output = this.getNodeParameter('output', i, 'simplified') as string;
	const fields = this.getNodeParameter('fields', i, []) as string[];

	if (operation === 'query') {
		const name = collectionName.call(this, i);
		const response = (await apiRequest.call(
			this,
			'POST',
			`/v3/collections/${name}/query`,
			{ query, ...(await searchBody.call(this, i, decodeURIComponent(name))) },
			{},
			{},
			i,
		)) as IDataObject;
		const results = (response.results as IDataObject[] | undefined) ?? [];
		return results.map((r) => shapeResult(r, output, fields, decodeURIComponent(name)));
	}

	const collections = this.getNodeParameter('collections', i) as string[] | string;
	const names = Array.isArray(collections) ? collections : list(collections);
	if (!names.length || names.length > 10) {
		throw new NodeOperationError(
			this.getNode(),
			`'Collections' has ${names.length} collections, and a search takes 1 to 10`,
			{ itemIndex: i, description: "Pick between 1 and 10 collections in 'Collections'" },
		);
	}
	// Each collection gets its own body, so filter values are typed as that collection stores them.
	const bodies = await Promise.all(names.map((name) => searchBody.call(this, i, name)));
	const response = (await apiRequest.call(
		this,
		'POST',
		'/v3/collections/batch-query',
		{ query, collections: names.map((collection, n) => ({ collection, ...bodies[n] })) },
		{},
		{},
		i,
	)) as IDataObject;
	const { items, missing, failures } = batchResults(response, output, fields);
	// A collection rejected for a field it doesn't have: drop that field's conditions as if no
	// document has it, and ask that collection again. "Any condition" filters can still match there.
	for (const m of missing) {
		// Match by name in case the API ever reorders its results.
		const body = bodies[names.indexOf(m.collection)] ?? bodies[m.index];
		let field = m.field;
		let filter = body.filter as IDataObject | undefined;
		for (let attempt = 0; attempt < 10; attempt++) {
			const reduced = filter ? withoutField(filter, field) : true;
			if (reduced === null) {
				failures.push({ collection: m.collection, message: m.message });
				break;
			}
			if (reduced === false) break;
			filter = reduced === true ? undefined : reduced;
			try {
				const single = (await apiRequest.call(
					this,
					'POST',
					`/v3/collections/${encodeURIComponent(m.collection)}/query`,
					dropEmpty({ query, ...body, filter }),
					{},
					{},
					i,
				)) as IDataObject;
				for (const r of (single.results as IDataObject[] | undefined) ?? []) {
					items.push(shapeResult(r, output, fields, m.collection));
				}
				break;
			} catch (error) {
				const text = `${(error as Error).message} ${String((error as { description?: string }).description ?? '')}`;
				const next = missingField(text);
				if (!next) {
					failures.push({ collection: m.collection, message: (error as Error).message });
					break;
				}
				field = next;
			}
		}
	}
	if (failures.length) {
		throw new NodeOperationError(
			this.getNode(),
			`Search failed in ${failures.map((f) => `'${f.collection}'`).join(', ')}: ${failures[0].message}`,
			{
				itemIndex: i,
				description:
					"No results were returned. Fix the collection, or remove it from 'Collections' and run again.",
			},
		);
	}
	return items;
}

/** The field named in the API's "not a filterable attribute" error, if that is the error. */
export function missingField(message: string): string | undefined {
	return /"([^"]+)" is not a filterable attribute/.exec(message)?.[1];
}

/**
 * Whether a document without the field passes one operator, read as the search index reads a
 * missing value: as null (checked on staging). $eq null matches it, $ne null doesn't, and $ne or
 * $nin with any other value does. The index rejects null inside $in and $nin lists, and a
 * comparison against null means nothing, so those return null and the error stays visible.
 */
function absentMatches(op: string, operand: unknown): boolean | null {
	const hasNull = Array.isArray(operand) && operand.includes(null);
	switch (op) {
		case '$eq':
			return operand === null;
		case '$ne':
			return operand !== null;
		case '$in':
			return hasNull ? null : false;
		case '$nin':
			return hasNull ? null : true;
		case '$exists':
			return !operand;
		case '$gt':
		case '$gte':
		case '$lt':
		case '$lte':
			return operand === null ? null : false;
		default:
			return null;
	}
}

/**
 * The filter as it applies to documents that don't have `field`: true matches every document,
 * false matches none, and null means an operator this can't reason about, so the caller keeps the
 * collection's error visible rather than guess.
 */
export function withoutField(filter: unknown, field: string): IDataObject | boolean | null {
	if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return null;
	const parts: Array<IDataObject | boolean | null> = [];
	for (const [key, value] of Object.entries(filter as IDataObject)) {
		if (key === '$and' || key === '$or') {
			if (!Array.isArray(value)) return null;
			const children = value.map((c) => withoutField(c, field));
			if (children.includes(null)) return null;
			const any = key === '$or';
			if (children.includes(any)) {
				parts.push(any);
				continue;
			}
			const rest = children.filter((c) => typeof c === 'object') as IDataObject[];
			parts.push(rest.length === 0 ? !any : rest.length === 1 ? rest[0] : { [key]: rest });
		} else if (key.startsWith('$')) {
			return null;
		} else if (key !== field) {
			parts.push({ [key]: value } as IDataObject);
		} else if (value === null || typeof value !== 'object' || Array.isArray(value)) {
			parts.push(absentMatches('$eq', value)); // {"field": value} is shorthand for $eq
		} else {
			for (const [op, operand] of Object.entries(value as IDataObject)) {
				parts.push(absentMatches(op, operand));
			}
		}
	}
	// Several keys in one object are all required.
	if (parts.includes(null)) return null;
	if (parts.includes(false)) return false;
	const rest = parts.filter((p) => typeof p === 'object') as IDataObject[];
	if (rest.length === 0) return true;
	return rest.length === 1 ? rest[0] : { $and: rest };
}

/**
 * Passages from a batch query, one item each. Collections the API rejected for a field they
 * don't have come back in `missing`, so the caller can retry them; other failures in `failures`.
 */
export function batchResults(
	response: IDataObject,
	output: string,
	fields: string[],
): {
	items: IDataObject[];
	missing: Array<{ index: number; collection: string; field: string; message: string }>;
	failures: Array<{ collection: string; message: string }>;
} {
	const items: IDataObject[] = [];
	const missing: Array<{ index: number; collection: string; field: string; message: string }> = [];
	const failures: Array<{ collection: string; message: string }> = [];
	const entries = (response.results as IDataObject[] | undefined) ?? [];
	entries.forEach((entry, index) => {
		const collection = String(entry.collection);
		if (entry.status !== 'succeeded' && entry.error) {
			const error = entry.error as IDataObject;
			const message = String(error.message ?? error.detail ?? entry.status);
			const field = missingField(message);
			if (field) missing.push({ index, collection, field, message });
			else failures.push({ collection, message });
			return;
		}
		for (const r of (entry.results as IDataObject[] | undefined) ?? []) {
			items.push(shapeResult(r, output, fields, collection));
		}
	});
	return { items, missing, failures };
}

async function runDocument(this: IExecuteFunctions, operation: string, i: number): Promise<Result> {
	const collection = collectionName.call(this, i);
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const documentId = () => encodeURIComponent(locatorValue.call(this, 'documentId', i));
	const returnAll = () => this.getNodeParameter('returnAll', i, false) as boolean;
	const limit = () => (returnAll() ? undefined : (this.getNodeParameter('limit', i) as number));

	switch (operation) {
		case 'getMany': {
			const filter = await buildMetadataFilter.call(
				this,
				options,
				'metadataFilter',
				decodeURIComponent(collection),
				i,
			);
			return apiRequestAllItems.call(
				this,
				`/v3/collections/${collection}/documents`,
				'documents',
				dropEmpty({
					include_custom_metadata: options.includeCustomMetadata,
					metadata_filter: filter ? JSON.stringify(filter) : undefined,
				}),
				limit(),
				i,
			);
		}
		case 'get':
			return apiRequest.call(
				this,
				'GET',
				`/v3/collections/${collection}/documents/${documentId()}`,
				undefined,
				dropEmpty({
					include_regions: options.includeRegions,
					include_metadata: options.includeMetadata,
				}),
				{},
				i,
			);
		case 'getPage':
			return apiRequest.call(
				this,
				'GET',
				`/v3/collections/${collection}/documents/${documentId()}/pages/${this.getNodeParameter('pageNumber', i)}`,
				undefined,
				dropEmpty({ include_regions: options.includeRegions }),
				{},
				i,
			);
		case 'getChunks': {
			const max = limit();
			const chunks: IDataObject[] = [];
			let cursor: number | undefined;
			do {
				const page = (await apiRequest.call(
					this,
					'GET',
					`/v3/collections/${collection}/chunks`,
					undefined,
					dropEmpty({
						document_id: decodeURIComponent(documentId()),
						limit: max === undefined ? 100 : Math.min(100, max - chunks.length),
						cursor,
						include_regions: options.includeRegions,
						include_metadata: options.includeMetadata,
					}),
					{},
					i,
				)) as IDataObject;
				chunks.push(...((page.chunks as IDataObject[] | undefined) ?? []));
				cursor = (page.next_cursor as number | null | undefined) ?? undefined;
			} while (cursor !== undefined && (max === undefined || chunks.length < max));
			return chunks;
		}
		case 'updateMetadata': {
			const metadata = keyValuePairs(this.getNodeParameter('metadata', i, {}) as IDataObject);
			if (!metadata) {
				throw new NodeOperationError(this.getNode(), "'Metadata' has no fields to set", {
					itemIndex: i,
					description: "Add a field and a value under 'Metadata'",
				});
			}
			return apiRequest.call(
				this,
				'PATCH',
				`/v3/collections/${collection}/documents/${documentId()}/metadata`,
				{ custom_metadata: metadata },
				{},
				{},
				i,
			);
		}
		case 'delete':
			return apiRequest.call(
				this,
				'DELETE',
				`/v2/collections/${collection}/documents/${documentId()}`,
				undefined,
				{},
				{},
				i,
			);
		case 'deleteAll':
			return apiRequest.call(
				this,
				'DELETE',
				`/v2/collections/${collection}/documents`,
				undefined,
				{},
				{},
				i,
			);
	}
	throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
		itemIndex: i,
	});
}

async function runCollection(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<Result> {
	switch (operation) {
		case 'getMany': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			return apiRequestAllItems.call(
				this,
				'/v2/collections',
				'collections',
				{},
				returnAll ? undefined : (this.getNodeParameter('limit', i) as number),
				i,
			);
		}
		case 'create': {
			const name = (this.getNodeParameter('name', i) as string).trim();
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			// The API answers 201 for a new collection and 200 when the name already exists.
			const response = (await apiRequest.call(
				this,
				'PUT',
				`/v2/collections/${encodeURIComponent(name)}`,
				dropEmpty({ description: options.description }),
				{},
				{ returnFullResponse: true },
				i,
			)) as { statusCode: number; body: IDataObject };
			if (response.statusCode === 200 && options.failIfExists) {
				throw new NodeOperationError(
					this.getNode(),
					`A collection named "${name}" already exists`,
					{
						itemIndex: i,
						description:
							"Choose another name, or turn off 'Fail If It Exists' to reuse the existing collection",
					},
				);
			}
			return { ...response.body, already_existed: response.statusCode === 200 };
		}
		case 'copy':
			return apiRequest.call(
				this,
				'POST',
				`/v2/collections/${collectionName.call(this, i)}/copy`,
				{
					target_name: (this.getNodeParameter('targetName', i) as string).trim(),
					include_graph: this.getNodeParameter('includeGraph', i),
				},
				{},
				{},
				i,
			);
		case 'delete':
			return apiRequest.call(
				this,
				'DELETE',
				`/v2/collections/${collectionName.call(this, i)}`,
				undefined,
				{},
				{},
				i,
			);
	}
	throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
		itemIndex: i,
	});
}

async function runJob(this: IExecuteFunctions, operation: string, i: number): Promise<Result> {
	const jobId = () => locatorValue.call(this, 'jobId', i);
	switch (operation) {
		case 'get':
			return apiRequest.call(
				this,
				'GET',
				`/v2/jobs/${encodeURIComponent(jobId())}`,
				undefined,
				{},
				{},
				i,
			);
		case 'cancel':
			return apiRequest.call(
				this,
				'DELETE',
				`/v2/jobs/${encodeURIComponent(jobId())}`,
				undefined,
				{},
				{},
				i,
			);
		case 'wait': {
			const job = await waitForJob.call(
				this,
				jobId(),
				this.getNodeParameter('waitTimeout', i) as number,
				i,
			);
			const failed = ['failed', 'cancelled', 'timed_out'].includes(String(job.status));
			if (failed && this.getNodeParameter('failOnError', i, false)) {
				throw new NodeOperationError(
					this.getNode(),
					`Job ${jobId()} ended as ${String(job.status)}${job.error_message ? `: ${String(job.error_message)}` : ''}`,
					{
						itemIndex: i,
						description:
							"If no files were read, check the bucket, container or folder name and the storage credential. 'Get Job' lists the files that did not index. Turn off 'Fail on Job Error' to continue anyway.",
					},
				);
			}
			return job;
		}
		case 'getMany': {
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			return apiRequestAllItems.call(
				this,
				'/v2/jobs',
				'jobs',
				dropEmpty({ status: filters.status, collection: collectionFilter(filters.collection) }),
				returnAll ? undefined : (this.getNodeParameter('limit', i) as number),
				i,
			);
		}
	}
	throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
		itemIndex: i,
	});
}

/** Sync settings. Fields the user added but left empty are sent empty, so an update can clear them. */
/** The jobs filter takes a collection name; the picker may hand back a resource-locator object. */
function collectionFilter(value: unknown): string | undefined {
	const name = value && typeof value === 'object' ? (value as IDataObject).value : value;
	return name ? String(name).trim() : undefined;
}

function syncSettings(fields: IDataObject): IDataObject {
	const body = dropEmpty({
		deletion_policy: fields.deletionPolicy,
		sync_interval_minutes: fields.syncIntervalMinutes || undefined,
		custom_metadata: keyValuePairs(fields.customMetadata as IDataObject),
		status: fields.status,
	});
	// 0 means manual runs only, which the API takes as an explicit null.
	if (fields.syncIntervalMinutes === 0) body.sync_interval_minutes = null;
	if (fields.prefix !== undefined) body.prefix = String(fields.prefix).trim();
	if (fields.includePatterns !== undefined)
		body.include_patterns = globList(fields.includePatterns);
	if (fields.excludePatterns !== undefined)
		body.exclude_patterns = globList(fields.excludePatterns);
	return body;
}

async function runSync(this: IExecuteFunctions, operation: string, i: number): Promise<Result> {
	const syncId = () => encodeURIComponent(locatorValue.call(this, 'syncId', i));
	const storage = SYNC_STORAGES.find((s) => s.value === operation);
	if (storage) {
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const auth = await storageAuth.call(this, storage.credential, 'sync');
		const bucket = locatorValue.call(this, 'bucket', i);
		const body: IDataObject = {
			...syncSettings({
				...options,
				prefix: String(this.getNodeParameter('prefix', i, '', { extractValue: true }) ?? ''),
			}),
			processing_type: this.getNodeParameter('processingType', i),
		};
		if (storage.path === 'azure') {
			Object.assign(body, {
				container: bucket,
				account_name: auth.account_name,
				account_key: auth.account_key,
			});
		} else if (storage.path === 'gcs') {
			Object.assign(body, { bucket, service_account_json: auth.service_account_json });
		} else if (storage.path === 's3') {
			Object.assign(body, { bucket, storage_type: 's3', region: auth.region, auth: auth.auth });
		} else {
			Object.assign(body, { bucket, ...auth });
		}
		return apiRequest.call(
			this,
			'POST',
			`/v2/collections/${collectionName.call(this, i)}/sync/${storage.path}`,
			body,
			{},
			{},
			i,
		);
	}
	switch (operation) {
		case 'getMany': {
			const response = (await apiRequest.call(
				this,
				'GET',
				'/v2/syncs',
				undefined,
				{},
				{},
				i,
			)) as IDataObject;
			return (response.connections as IDataObject[] | undefined) ?? [];
		}
		case 'get':
			return apiRequest.call(this, 'GET', `/v2/syncs/${syncId()}`, undefined, {}, {}, i);
		case 'update': {
			const body = syncSettings(this.getNodeParameter('updateFields', i, {}) as IDataObject);
			if (!Object.keys(body).length) {
				throw new NodeOperationError(this.getNode(), "'Update Fields' has nothing to change", {
					itemIndex: i,
					description: "Add at least one field under 'Update Fields'",
				});
			}
			return apiRequest.call(this, 'PATCH', `/v2/syncs/${syncId()}`, body, {}, {}, i);
		}
		case 'reconcile':
			return apiRequest.call(this, 'POST', `/v2/syncs/${syncId()}/reconcile`, {}, {}, {}, i);
		case 'delete':
			return apiRequest.call(this, 'DELETE', `/v2/syncs/${syncId()}`, undefined, {}, {}, i);
	}
	throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
		itemIndex: i,
	});
}

async function runParse(this: IExecuteFunctions, operation: string, i: number): Promise<Result> {
	if (operation === 'getParseJob') {
		const id = String(this.getNodeParameter('parseJobId', i)).trim();
		return apiRequest.call(
			this,
			'GET',
			`/v3/parse/jobs/${encodeURIComponent(id)}`,
			undefined,
			{},
			{},
			i,
		);
	}
	const parseType = this.getNodeParameter('parseType', i) as string;
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	let input: string;
	if (this.getNodeParameter('inputType', i) === 'binary') {
		const field = this.getNodeParameter('binaryPropertyName', i) as string;
		const binary = this.helpers.assertBinaryData(i, field);
		const { body, contentType } = buildMultipart({}, [
			{
				field: 'file',
				filename: binary.fileName || `${field}.${binary.fileExtension || 'bin'}`,
				contentType: binary.mimeType || 'application/octet-stream',
				data: await this.helpers.getBinaryDataBuffer(i, field),
			},
		]);
		const upload = (await apiRequest.call(
			this,
			'POST',
			'/v3/parse/uploads',
			body,
			{},
			{ headers: { 'Content-Type': contentType } },
			i,
		)) as IDataObject;
		input = String(upload.file_id);
	} else {
		input = (this.getNodeParameter('fileUrl', i) as string).trim();
	}
	const body: IDataObject = dropEmpty({
		input,
		include_tags_summary: options.includeTagsSummary,
		...(parseType === 'documents'
			? { processing_type: this.getNodeParameter('processingType', i) }
			: {
					include_images: options.includeImages,
					include_verified_facts: options.includeVerifiedFacts,
				}),
	});
	const job = (await apiRequest.call(
		this,
		'POST',
		`/v3/parse/${parseType}`,
		body,
		{},
		{},
		i,
	)) as IDataObject;
	if (!this.getNodeParameter('waitForCompletion', i, true)) return job;
	const finished = await waitForParseJob.call(
		this,
		String(job.job_id),
		this.getNodeParameter('waitTimeout', i, 600) as number,
		i,
	);
	if (finished.status === 'failed' || finished.status === 'cancelled') {
		const error = (finished.error ?? {}) as IDataObject;
		throw new NodeOperationError(
			this.getNode(),
			`The parse job ended as ${String(finished.status)}: ${String(error.message ?? error.code ?? 'no reason given')}`,
			{
				itemIndex: i,
				description:
					'Check that the file is under 100 MB and is a supported type, then run the node again',
			},
		);
	}
	// Results over 1 MB come back with chunks: null and a short-lived signed link to {"chunks": [...]}.
	if (!Array.isArray(finished.chunks) && finished.result_url) {
		const stored = (await this.helpers.httpRequest({
			method: 'GET',
			url: String(finished.result_url),
			json: true,
		})) as IDataObject;
		if (Array.isArray(stored?.chunks)) finished.chunks = stored.chunks;
	}
	if (this.getNodeParameter('output', i, 'single') === 'split' && Array.isArray(finished.chunks)) {
		return (finished.chunks as IDataObject[]).map((chunk) => ({
			job_id: finished.job_id,
			...chunk,
		}));
	}
	return finished;
}

/** n8n convention: a delete returns {"deleted": true} so the next node still runs. */
const DELETES: Record<string, string[]> = {
	document: ['delete', 'deleteAll'],
	collection: ['delete'],
	sync: ['delete'],
};

/**
 * One shape for both job responses: GET /v2/jobs/{id} nests counts under progress/result and uses
 * error_message/completed_at, while GET /v2/jobs rows carry flat files_* fields, error and finished_at.
 */
export function simplifyJob(job: IDataObject): IDataObject {
	const progress = (job.progress ?? {}) as IDataObject;
	const outcome = (job.result ?? {}) as IDataObject;
	return dropEmpty({
		job_id: job.job_id,
		status: job.status,
		collection_name: job.collection_name,
		job_type: job.job_type,
		files_total: job.files_total ?? progress.files_total,
		files_indexed: job.files_indexed ?? outcome.files_indexed,
		files_failed: job.files_failed ?? outcome.files_failed ?? progress.files_failed,
		error: job.error_message ?? job.error,
		created_at: job.created_at,
		finished_at: job.completed_at ?? job.finished_at,
	});
}

function simplifyDocument(doc: IDataObject): IDataObject {
	return pickDefined(doc, [
		'document_id',
		'filename',
		'status',
		'chunk_count',
		'content_type',
		'uri',
		'indexed_at',
		'custom_metadata',
	]);
}

function simplifySync(sync: IDataObject): IDataObject {
	return pickDefined(sync, [
		'sync_id',
		'collection_name',
		'storage_type',
		'bucket',
		'prefix',
		'status',
		'sync_interval_minutes',
		'last_sync_at',
		'next_sync_at',
		'last_sync_error',
	]);
}

function pickDefined(source: IDataObject, keys: string[]): IDataObject {
	return dropEmpty(pick(source, keys));
}

function finishOutput(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
	result: Result,
): Result {
	if (DELETES[resource]?.includes(operation)) return { deleted: true };
	if (!this.getNodeParameter('simplify', i, false)) return result;
	const each = (fn: (row: IDataObject) => IDataObject) =>
		Array.isArray(result) ? result.map(fn) : fn(result);
	if (resource === 'index' || (resource === 'job' && operation !== 'cancel'))
		return each(simplifyJob);
	if (resource === 'document' && operation === 'getMany') return each(simplifyDocument);
	if (resource === 'sync' && operation !== 'reconcile') return each(simplifySync);
	return result;
}

export async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	let result: Result;
	switch (resource) {
		case 'search':
			result = await runSearch.call(this, operation, i);
			break;
		case 'index':
			result = await runIndex.call(this, operation, i);
			break;
		case 'document':
			result = await runDocument.call(this, operation, i);
			break;
		case 'collection':
			result = await runCollection.call(this, operation, i);
			break;
		case 'job':
			result = await runJob.call(this, operation, i);
			break;
		case 'sync':
			result = await runSync.call(this, operation, i);
			break;
		case 'parse':
			result = await runParse.call(this, operation, i);
			break;
		default:
			throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, {
				itemIndex: i,
			});
	}
	result = finishOutput.call(this, resource, operation, i, result);
	const rows = Array.isArray(result) ? result : [result ?? { success: true }];
	return rows.map((json) => ({ json, pairedItem: { item: i } }));
}
