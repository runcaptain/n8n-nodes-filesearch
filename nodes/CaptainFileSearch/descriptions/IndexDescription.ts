import type { INodeProperties } from 'n8n-workflow';

import {
	collectionLocator,
	customMetadataOption,
	ifExistsOption,
	maskPiiOptions,
	parsingScriptOption,
	processingTypeField,
	simplifyField,
	transcriptionLanguageOption,
	waitFields,
} from './shared';

export type Scope = 'all' | 'folder' | 'file' | 'manifest';

export interface SourceConfig {
	value: string;
	name: string;
	credential: string;
	path: string;
	kind: 'bucket' | 'drive';
	scopes: Array<{ value: Scope; name: string; description: string }>;
	/** Request body key and label for the folder and file targets, per scope. */
	folderKey?: string;
	fileKey?: string;
	fileSupportsSourceIdentity?: boolean;
	manifestExample?: string;
}

const bucketScopes = (noun: string): SourceConfig['scopes'] => [
	{
		value: 'all',
		name: `Whole ${noun}`,
		description: `Index every file in the ${noun.toLowerCase()}`,
	},
	{ value: 'folder', name: 'Folder', description: 'Index every file under a folder path' },
	{ value: 'file', name: 'Single File', description: 'Index one file' },
	{
		value: 'manifest',
		name: 'Manifest',
		description: 'Index the files listed in a JSON Lines manifest stored in the same place',
	},
];

const driveScopes = (whole: string): SourceConfig['scopes'] => [
	{ value: 'all', name: whole, description: 'Index every file you can reach with this credential' },
	{
		value: 'folder',
		name: 'Folder',
		description: 'Index every file in a folder and its subfolders',
	},
	{ value: 'file', name: 'Single File', description: 'Index one file' },
];

export const SOURCES: SourceConfig[] = [
	{
		value: 's3',
		name: 'Amazon S3',
		credential: 'captainAwsS3Api',
		path: 's3',
		kind: 'bucket',
		scopes: bucketScopes('Bucket'),
		fileSupportsSourceIdentity: true,
		manifestExample: 'e.g. manifests/batch.jsonl',
	},
	{
		value: 'gcs',
		name: 'Google Cloud Storage',
		credential: 'captainGoogleServiceAccountApi',
		path: 'gcs',
		kind: 'bucket',
		scopes: bucketScopes('Bucket'),
		fileSupportsSourceIdentity: true,
		manifestExample: 'e.g. manifests/batch.jsonl',
	},
	{
		value: 'azure',
		name: 'Azure Blob Storage',
		credential: 'captainAzureBlobApi',
		path: 'azure',
		kind: 'bucket',
		scopes: bucketScopes('Container'),
		fileSupportsSourceIdentity: true,
		manifestExample: 'e.g. manifests/batch.jsonl',
	},
	{
		value: 'r2',
		name: 'Cloudflare R2',
		credential: 'captainCloudflareR2Api',
		path: 'r2',
		kind: 'bucket',
		scopes: bucketScopes('Bucket'),
		fileSupportsSourceIdentity: true,
		manifestExample: 'e.g. manifests/batch.jsonl',
	},
	{
		value: 'supabase',
		name: 'Supabase Storage',
		credential: 'captainSupabaseStorageApi',
		path: 'supabase',
		kind: 'bucket',
		scopes: bucketScopes('Bucket'),
		fileSupportsSourceIdentity: true,
		manifestExample: 'e.g. manifests/batch.jsonl',
	},
	{
		value: 'backblaze',
		name: 'Backblaze B2',
		credential: 'captainBackblazeB2Api',
		path: 'backblaze',
		kind: 'bucket',
		scopes: bucketScopes('Bucket'),
		fileSupportsSourceIdentity: true,
		manifestExample: 'e.g. manifests/batch.jsonl',
	},
	{
		value: 'gdrive',
		name: 'Google Drive',
		credential: 'captainGoogleServiceAccountApi',
		path: 'gdrive',
		kind: 'drive',
		scopes: driveScopes('Entire Drive'),
		folderKey: 'folder_id',
		fileKey: 'file_id',
	},
	{
		value: 'sharepoint',
		name: 'SharePoint',
		credential: 'captainMicrosoft365Api',
		path: 'sharepoint',
		kind: 'drive',
		scopes: driveScopes('Whole Site'),
		folderKey: 'folder_id',
		fileKey: 'item_id',
	},
	{
		value: 'onedrive',
		name: 'OneDrive',
		credential: 'captainMicrosoft365Api',
		path: 'onedrive',
		kind: 'drive',
		scopes: driveScopes('Whole Drive'),
		folderKey: 'folder_id',
		fileKey: 'item_id',
	},
	{
		value: 'dropbox',
		name: 'Dropbox',
		credential: 'captainDropboxApi',
		path: 'dropbox',
		kind: 'drive',
		scopes: driveScopes('Entire Dropbox'),
		folderKey: 'directory_path',
		fileKey: 'file_path',
		fileSupportsSourceIdentity: true,
	},
];

const DIRECT_OPS = ['file', 'url', 'text', 'youtube'];
const ALL_INDEX_OPS = [...DIRECT_OPS, ...SOURCES.map((s) => s.value)];

export const indexOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['index'] } },
		options: [
			{
				name: 'Index File From URL',
				value: 'url',
				description: 'Index documents hosted at public web addresses',
				action: 'Index file from URL',
			},
			{
				name: 'Index Files From Amazon S3',
				value: 's3',
				description: 'Index a bucket, folder, file or manifest stored in Amazon S3',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Amazon S3',
			},
			{
				name: 'Index Files From Azure Blob Storage',
				value: 'azure',
				description: 'Index a container, folder, file or manifest stored in Azure Blob Storage',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Azure Blob Storage',
			},
			{
				name: 'Index Files From Backblaze B2',
				value: 'backblaze',
				description: 'Index a bucket, folder, file or manifest stored in Backblaze B2',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Backblaze B2',
			},
			{
				name: 'Index Files From Cloudflare R2',
				value: 'r2',
				description: 'Index a bucket, folder, file or manifest stored in Cloudflare R2',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Cloudflare R2',
			},
			{
				name: 'Index Files From Dropbox',
				value: 'dropbox',
				description: 'Index a whole Dropbox, a folder or one file',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Dropbox',
			},
			{
				name: 'Index Files From Google Cloud Storage',
				value: 'gcs',
				description: 'Index a bucket, folder, file or manifest stored in Google Cloud Storage',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Google Cloud Storage',
			},
			{
				name: 'Index Files From Google Drive',
				value: 'gdrive',
				description: 'Index a whole Google Drive, a folder or one file',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Google Drive',
			},
			{
				name: 'Index Files From OneDrive',
				value: 'onedrive',
				description: 'Index a whole OneDrive, a folder or one file',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from OneDrive',
			},
			{
				name: 'Index Files From SharePoint',
				value: 'sharepoint',
				description: 'Index a whole SharePoint site, a folder or one file',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from SharePoint',
			},
			{
				name: 'Index Files From Supabase Storage',
				value: 'supabase',
				description: 'Index a bucket, folder, file or manifest stored in Supabase Storage',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index files from Supabase Storage',
			},
			{
				name: 'Index Text',
				value: 'text',
				description: 'Index a piece of text as its own document in a collection',
				action: 'Index text',
			},
			{
				name: 'Index Uploaded File',
				value: 'file',
				description:
					'Index a file from an earlier step, such as an email attachment or form upload',
				action: 'Index uploaded file',
			},
			{
				name: 'Index YouTube Video',
				value: 'youtube',
				description: 'Index the transcript, audio or video of YouTube videos',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Index YouTube video',
			},
		],
		default: 'file',
	},
];

function sourceFields(source: SourceConfig): INodeProperties[] {
	const show = { resource: ['index'], operation: [source.value] };
	const at = (scope: Scope[]) => ({ show: { ...show, scope } });
	const fields: INodeProperties[] = [];

	if (source.value === 'sharepoint') {
		fields.push({
			displayName: 'Site URL',
			name: 'siteUrl',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'e.g. https://contoso.sharepoint.com/sites/Sales',
			description: 'The SharePoint site URL, or a Microsoft Graph site ID',
			displayOptions: { show },
		});
	}
	if (source.value === 'onedrive') {
		fields.push({
			displayName: 'User Email',
			name: 'userEmail',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'e.g. name@contoso.com',
			description: 'The OneDrive for Business user whose drive is indexed',
			displayOptions: { show },
		});
	}
	if (source.kind === 'bucket') {
		const noun = source.value === 'azure' ? 'Container' : 'Bucket';
		fields.push({
			displayName: `${noun} Name`,
			name: 'bucketName',
			type: 'string',
			required: true,
			default: '',
			placeholder: source.value === 'azure' ? 'e.g. documents' : 'e.g. my-company-docs',
			displayOptions: { show },
		});
	}

	fields.push({
		displayName: 'What to Index',
		name: 'scope',
		type: 'options',
		noDataExpression: true,
		options: source.scopes,
		default: 'all',
		displayOptions: { show },
	});

	if (source.kind === 'bucket') {
		fields.push(
			{
				displayName: 'Folder Path',
				name: 'folderPath',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. reports/2024/',
				description: 'Path inside the bucket. Every file under it is indexed.',
				displayOptions: at(['folder']),
			},
			{
				displayName: 'File Path',
				name: 'filePath',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. reports/2024/q3-review.pdf',
				description:
					'Path of the file inside the bucket. A full URI such as s3://bucket/key also works.',
				displayOptions: at(['file']),
			},
			{
				displayName: 'Manifest Path',
				name: 'manifestUri',
				type: 'string',
				required: true,
				default: '',
				placeholder: source.manifestExample,
				description:
					'Path of a UTF-8 JSON Lines file in the same bucket, with one {"uri": ...} object per line. A full URI also works.',
				displayOptions: at(['manifest']),
			},
		);
	} else if (source.value === 'dropbox') {
		fields.push(
			{
				displayName: 'Folder Path',
				name: 'folderPath',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. /Reports/2024',
				displayOptions: at(['folder']),
			},
			{
				displayName: 'File Path',
				name: 'filePath',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. /Reports/annual-review.pdf',
				displayOptions: at(['file']),
			},
		);
	} else {
		const idHint =
			source.value === 'gdrive'
				? 'the part after /folders/ or /d/ in the Drive URL'
				: 'a Microsoft Graph driveItem ID';
		fields.push(
			{
				displayName: 'Folder ID',
				name: 'folderId',
				type: 'string',
				required: true,
				default: '',
				description: `ID of the folder, ${idHint}`,
				displayOptions: at(['folder']),
			},
			{
				displayName: 'File ID',
				name: 'fileId',
				type: 'string',
				required: true,
				default: '',
				description: `ID of the file, ${idHint}`,
				displayOptions: at(['file']),
			},
		);
	}

	fields.push(processingTypeField(show));

	const extra: INodeProperties[] = [];
	if (source.value === 's3') {
		extra.push({
			displayName: 'Bucket Region',
			name: 'bucketRegion',
			type: 'string',
			default: '',
			placeholder: 'e.g. us-west-2',
			description: 'Overrides the region set in the credential',
		});
	}
	if (source.value === 'gdrive') {
		extra.push({
			displayName: 'Drive User Email',
			name: 'subjectEmail',
			type: 'string',
			default: '',
			placeholder: 'e.g. name@example.com',
			description: 'Overrides the Workspace user set in the credential',
		});
	}
	if (source.value === 'sharepoint') {
		extra.push({
			displayName: 'Document Library ID',
			name: 'driveId',
			type: 'string',
			default: '',
			description: 'Graph drive ID of a library other than the default Documents library',
		});
	}
	if (source.fileSupportsSourceIdentity) {
		extra.push({
			displayName: 'Source Identity',
			name: 'sourceIdentity',
			type: 'string',
			default: '',
			description:
				'Single File only. A stable ID for this document, so a copy at another path replaces it instead of adding a duplicate.',
		});
	}

	fields.push({
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show },
		options: sortOptions([
			ifExistsOption,
			customMetadataOption,
			parsingScriptOption,
			transcriptionLanguageOption,
			...maskPiiOptions,
			...extra,
		]),
	});

	return fields;
}

function sortOptions(options: INodeProperties[]): INodeProperties[] {
	return [...options].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const directFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		hint: 'The name of the input field holding the file. Separate several fields with commas.',
		displayOptions: { show: { resource: ['index'], operation: ['file'] } },
	},
	{
		displayName: 'URLs',
		name: 'urls',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/report.pdf',
		description: 'One URL per line. PDF, Office, text, images, audio and video are supported.',
		displayOptions: { show: { resource: ['index'], operation: ['url'] } },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['index'], operation: ['text'] } },
	},
	{
		displayName: 'Video URLs',
		name: 'videoUrls',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		required: true,
		placeholder: 'e.g. https://www.youtube.com/watch?v=...',
		description: 'One YouTube URL per line',
		displayOptions: { show: { resource: ['index'], operation: ['youtube'] } },
	},
	{
		displayName: 'Index',
		name: 'youtubeMode',
		type: 'options',
		options: [
			{
				name: 'Transcript',
				value: 'transcript',
				description: 'The caption track, as text. Cheapest.',
			},
			{
				name: 'Audio',
				value: 'audio',
				description: 'Transcribe the audio track. Works for videos without captions.',
			},
			{
				name: 'Video',
				value: 'video',
				description: 'Index what is shown on screen as well as what is said',
			},
		],
		default: 'transcript',
		displayOptions: { show: { resource: ['index'], operation: ['youtube'] } },
	},
	processingTypeField({ resource: ['index'], operation: ['file', 'url'] }),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['index'], operation: ['file'] } },
		options: sortOptions([
			ifExistsOption,
			customMetadataOption,
			transcriptionLanguageOption,
			...maskPiiOptions,
		]),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['index'], operation: ['url'] } },
		options: sortOptions([
			customMetadataOption,
			parsingScriptOption,
			transcriptionLanguageOption,
			...maskPiiOptions,
		]),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['index'], operation: ['text'] } },
		options: sortOptions([
			{
				displayName: 'File Name',
				name: 'filename',
				type: 'string',
				default: '',
				placeholder: 'e.g. meeting-notes.txt',
				description: 'Name for the document. Defaults to snippet-N.txt.',
			},
			customMetadataOption,
			...maskPiiOptions,
		]),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['index'], operation: ['youtube'] } },
		options: sortOptions([
			{
				displayName: 'Caption Languages',
				name: 'languages',
				type: 'string',
				default: '',
				placeholder: 'e.g. en, es',
				description:
					'Preferred caption languages in order, as ISO 639-1 codes. Defaults to English.',
			},
			{
				displayName: 'If No Captions',
				name: 'onMissingTranscript',
				type: 'options',
				options: [
					{ name: 'Fail the Video', value: 'fail' },
					{ name: 'Transcribe the Audio', value: 'audio' },
					{ name: 'Index the Video', value: 'video' },
				],
				default: 'fail',
				description: 'What to do when a video has no captions. Used only for Transcript.',
			},
			customMetadataOption,
			...maskPiiOptions,
		]),
	},
];

export const indexFields: INodeProperties[] = [
	collectionLocator({ resource: ['index'], operation: ALL_INDEX_OPS }),
	...directFields,
	...SOURCES.flatMap(sourceFields),
	...waitFields({ resource: ['index'], operation: ALL_INDEX_OPS }),
	simplifyField({ resource: ['index'], operation: ALL_INDEX_OPS }),
];
