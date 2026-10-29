import type { INodeProperties } from 'n8n-workflow';

import {
	collectionLocator,
	customMetadataOption,
	ifExistsOption,
	maskPiiOptions,
	parsingScriptOption,
	pickerLocator,
	processingTypeField,
	simplifyField,
	transcriptionLanguageOption,
	waitFields,
} from './shared';
import { AWS_REGIONS, CAPTION_LANGUAGES } from '../storage/lists';

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
				action: 'Index files from amazon S3',
			},
			{
				name: 'Index Files From Azure Blob Storage',
				value: 'azure',
				description: 'Index a container, folder, file or manifest stored in Azure Blob Storage',
				action: 'Index files from azure blob storage',
			},
			{
				name: 'Index Files From Backblaze B2',
				value: 'backblaze',
				description: 'Index a bucket, folder, file or manifest stored in Backblaze B2',
				action: 'Index files from backblaze B2',
			},
			{
				name: 'Index Files From Cloudflare R2',
				value: 'r2',
				description: 'Index a bucket, folder, file or manifest stored in Cloudflare R2',
				action: 'Index files from cloudflare R2',
			},
			{
				name: 'Index Files From Dropbox',
				value: 'dropbox',
				description: 'Index a whole Dropbox, a folder or one file',
				action: 'Index files from dropbox',
			},
			{
				name: 'Index Files From Google Cloud Storage',
				value: 'gcs',
				description: 'Index a bucket, folder, file or manifest stored in Google Cloud Storage',
				action: 'Index files from google cloud storage',
			},
			{
				name: 'Index Files From Google Drive',
				value: 'gdrive',
				description: 'Index a whole Google Drive, a folder or one file',
				action: 'Index files from google drive',
			},
			{
				name: 'Index Files From OneDrive',
				value: 'onedrive',
				description: 'Index a whole OneDrive, a folder or one file',
				action: 'Index files from onedrive',
			},
			{
				name: 'Index Files From SharePoint',
				value: 'sharepoint',
				description: 'Index a whole SharePoint site, a folder or one file',
				action: 'Index files from sharepoint',
			},
			{
				name: 'Index Files From Supabase Storage',
				value: 'supabase',
				description: 'Index a bucket, folder, file or manifest stored in Supabase Storage',
				action: 'Index files from supabase storage',
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
				action: 'Index youtube video',
			},
		],
		default: 'file',
	},
];

function sourceFields(source: SourceConfig): INodeProperties[] {
	const show = { resource: ['index'], operation: [source.value] };
	const at = (scope: Scope[]) => ({ show: { ...show, scope } });
	const fields: INodeProperties[] = [];

	const DRIVE_FOLDER_URL =
		'https:\\/\\/drive\\.google\\.com\\/drive\\/(?:u\\/\\d+\\/)?folders\\/([\\w-]+)';
	const DRIVE_FILE_URL =
		'https:\\/\\/(?:drive|docs)\\.google\\.com\\/(?:file|document|spreadsheets|presentation)\\/d\\/([\\w-]+)';
	const pathHint = 'Type a path to narrow the list, e.g. reports/ shows what is inside reports.';

	if (source.value === 'sharepoint') {
		fields.push(
			pickerLocator({
				name: 'siteUrl',
				displayName: 'Site',
				searchListMethod: 'searchSharePointSites',
				show,
				description: 'The SharePoint site to index',
				typed: [
					{
						name: 'url',
						displayName: 'By URL',
						placeholder: 'e.g. https://contoso.sharepoint.com/sites/Sales',
						extract: '(https?:\\/\\/\\S+)',
					},
					{
						name: 'id',
						displayName: 'By ID',
						placeholder: 'e.g. contoso.sharepoint.com,1a2b,3c4d',
					},
				],
			}),
		);
	}
	if (source.value === 'onedrive') {
		fields.push(
			pickerLocator({
				name: 'userEmail',
				displayName: 'User',
				searchListMethod: 'searchMicrosoftUsers',
				show,
				description:
					'The person whose OneDrive is indexed. Listing users needs the User.Read.All permission.',
				typed: [{ name: 'email', displayName: 'By Email', placeholder: 'e.g. nathan@contoso.com' }],
			}),
		);
	}
	if (source.kind === 'bucket') {
		const noun = source.value === 'azure' ? 'Container' : 'Bucket';
		fields.push(
			pickerLocator({
				name: 'bucketName',
				displayName: noun,
				searchListMethod: 'searchBuckets',
				show,
				description:
					source.value === 's3'
						? 'Listing needs an access key credential. With an IAM role, use By Name.'
						: `The ${noun.toLowerCase()} to index`,
				typed: [
					{
						name: 'name',
						displayName: 'By Name',
						placeholder: source.value === 'azure' ? 'e.g. documents' : 'e.g. my-company-docs',
					},
				],
			}),
		);
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
			pickerLocator({
				name: 'folderPath',
				displayName: 'Folder',
				searchListMethod: 'searchFolders',
				show: at(['folder']).show,
				description: `Every file under this folder is indexed. ${pathHint}`,
				typed: [{ name: 'path', displayName: 'By Path', placeholder: 'e.g. reports/2024/' }],
			}),
			pickerLocator({
				name: 'filePath',
				displayName: 'File',
				searchListMethod: 'searchFiles',
				show: at(['file']).show,
				description: pathHint,
				typed: [
					{ name: 'path', displayName: 'By Path', placeholder: 'e.g. reports/2024/q3-review.pdf' },
				],
			}),
			pickerLocator({
				name: 'manifestUri',
				displayName: 'Manifest',
				searchListMethod: 'searchManifests',
				show: at(['manifest']).show,
				description:
					'A UTF-8 JSON Lines file in the same bucket, with one {"uri": ...} object per line. The list shows .jsonl, .ndjson and .json files.',
				typed: [
					{ name: 'path', displayName: 'By Path', placeholder: source.manifestExample ?? '' },
				],
			}),
		);
	} else if (source.value === 'dropbox') {
		fields.push(
			pickerLocator({
				name: 'folderPath',
				displayName: 'Folder',
				searchListMethod: 'searchDropboxFolders',
				show: at(['folder']).show,
				description:
					'Every file in this folder and its subfolders is indexed. Type to search by name.',
				typed: [{ name: 'path', displayName: 'By Path', placeholder: 'e.g. /Reports/2024' }],
			}),
			pickerLocator({
				name: 'filePath',
				displayName: 'File',
				searchListMethod: 'searchDropboxFiles',
				show: at(['file']).show,
				description: 'Type to search by name',
				typed: [
					{ name: 'path', displayName: 'By Path', placeholder: 'e.g. /Reports/annual-review.pdf' },
				],
			}),
		);
	} else if (source.value === 'gdrive') {
		fields.push(
			pickerLocator({
				name: 'folderId',
				displayName: 'Folder',
				searchListMethod: 'searchDriveFolders',
				show: at(['folder']).show,
				description:
					'Every file in this folder and its subfolders is indexed. Type to search by name.',
				typed: [
					{
						name: 'url',
						displayName: 'By URL',
						placeholder: 'e.g. https://drive.google.com/drive/folders/1AbCdEf',
						extract: DRIVE_FOLDER_URL,
					},
					{ name: 'id', displayName: 'By ID', placeholder: 'e.g. 1AbCdEfGhIjKlMnOp' },
				],
			}),
			pickerLocator({
				name: 'fileId',
				displayName: 'File',
				searchListMethod: 'searchDriveFiles',
				show: at(['file']).show,
				description: 'Type to search by name',
				typed: [
					{
						name: 'url',
						displayName: 'By URL',
						placeholder: 'e.g. https://drive.google.com/file/d/1AbCdEf/view',
						extract: DRIVE_FILE_URL,
					},
					{ name: 'id', displayName: 'By ID', placeholder: 'e.g. 1AbCdEfGhIjKlMnOp' },
				],
			}),
		);
	} else {
		fields.push(
			pickerLocator({
				name: 'folderId',
				displayName: 'Folder',
				searchListMethod: 'searchMicrosoftFolders',
				show: at(['folder']).show,
				description:
					'Every file in this folder and its subfolders is indexed. Type to search by name.',
				typed: [{ name: 'id', displayName: 'By ID', placeholder: 'e.g. 01ABCDEF2GHIJKLMN' }],
			}),
			pickerLocator({
				name: 'fileId',
				displayName: 'File',
				searchListMethod: 'searchMicrosoftFiles',
				show: at(['file']).show,
				description: 'Type to search by name',
				typed: [{ name: 'id', displayName: 'By ID', placeholder: 'e.g. 01ABCDEF2GHIJKLMN' }],
			}),
		);
	}

	fields.push(processingTypeField(show));

	const extra: INodeProperties[] = [];
	if (source.value === 's3') {
		extra.push({
			displayName: 'Bucket Region',
			name: 'bucketRegion',
			type: 'options',
			options: AWS_REGIONS,
			default: 'us-east-1',
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
		const library = pickerLocator({
			name: 'driveId',
			displayName: 'Document Library',
			searchListMethod: 'searchSharePointLibraries',
			show: {},
			description: 'A library other than the default Documents library',
			typed: [{ name: 'id', displayName: 'By ID', placeholder: 'e.g. b!AbCdEf…' }],
			required: false,
		});
		delete library.displayOptions;
		extra.push(library);
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
				type: 'multiOptions',
				options: CAPTION_LANGUAGES,
				default: [],
				description:
					'Caption languages to use, in order of preference. If the video has none of them, File Search uses the first captions the video does have. Leave empty or choose Any Language to try English first.',
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
