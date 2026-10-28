import type { INodeProperties } from 'n8n-workflow';

import {
	collectionLocator,
	customMetadataOption,
	idLocator,
	processingTypeField,
	simplifyField,
} from './shared';

export const SYNC_STORAGES = [
	{ value: 'sync_s3', path: 's3', name: 'Amazon S3', credential: 'captainAwsS3Api' },
	{
		value: 'sync_gcs',
		path: 'gcs',
		name: 'Google Cloud Storage',
		credential: 'captainGoogleServiceAccountApi',
	},
	{
		value: 'sync_azure',
		path: 'azure',
		name: 'Azure Blob Storage',
		credential: 'captainAzureBlobApi',
	},
	{ value: 'sync_r2', path: 'r2', name: 'Cloudflare R2', credential: 'captainCloudflareR2Api' },
	{
		value: 'sync_supabase',
		path: 'supabase',
		name: 'Supabase Storage',
		credential: 'captainSupabaseStorageApi',
	},
	{
		value: 'sync_backblaze',
		path: 'backblaze',
		name: 'Backblaze B2',
		credential: 'captainBackblazeB2Api',
	},
];

const CREATE_OPS = SYNC_STORAGES.map((s) => s.value);

export const syncOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['sync'] } },
		options: [
			{
				name: 'Create Amazon S3 Sync',
				value: 'sync_s3',
				description:
					'Index an Amazon S3 bucket now, then keep the collection in step with new, changed and deleted files',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Create Amazon S3 sync',
			},
			{
				name: 'Create Azure Blob Storage Sync',
				value: 'sync_azure',
				description:
					'Index an Azure Blob Storage container now, then keep the collection in step with new, changed and deleted files',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Create Azure Blob Storage sync',
			},
			{
				name: 'Create Backblaze B2 Sync',
				value: 'sync_backblaze',
				description:
					'Index a Backblaze B2 bucket now, then keep the collection in step with new, changed and deleted files',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Create Backblaze B2 sync',
			},
			{
				name: 'Create Cloudflare R2 Sync',
				value: 'sync_r2',
				description:
					'Index a Cloudflare R2 bucket now, then keep the collection in step with new, changed and deleted files',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Create Cloudflare R2 sync',
			},
			{
				name: 'Create Google Cloud Storage Sync',
				value: 'sync_gcs',
				description:
					'Index a Google Cloud Storage bucket now, then keep the collection in step with new, changed and deleted files',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Create Google Cloud Storage sync',
			},
			{
				name: 'Create Supabase Storage Sync',
				value: 'sync_supabase',
				description:
					'Index a Supabase Storage bucket now, then keep the collection in step with new, changed and deleted files',
				// eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased -- product names keep their capitals in sentence case
				action: 'Create Supabase Storage sync',
			},
			{
				name: 'Delete Sync',
				value: 'delete',
				description:
					'Stop a sync and remove it permanently. Indexed documents stay in the collection.',
				action: 'Delete sync',
			},
			{
				name: 'Get Many Syncs',
				value: 'getMany',
				description: 'Retrieve a list of your syncs',
				action: 'Get many syncs',
			},
			{
				name: 'Get Sync',
				value: 'get',
				description: 'Retrieve a sync and the result of its last run',
				action: 'Get sync',
			},
			{
				name: 'Run Sync Now',
				value: 'reconcile',
				description: 'Check the storage for changes now instead of waiting for the schedule',
				action: 'Run sync now',
			},
			{
				name: 'Update Sync',
				value: 'update',
				description: 'Pause, resume or change the settings of a sync',
				action: 'Update sync',
			},
		],
		default: 'getMany',
	},
];

const show = { resource: ['sync'] };
const createShow = { ...show, operation: CREATE_OPS };

const patternsAndPolicy: INodeProperties[] = [
	{
		displayName: 'Exclude Patterns',
		name: 'excludePatterns',
		type: 'string',
		default: '',
		placeholder: 'e.g. **/drafts/**, *.tmp',
		description: 'Comma-separated glob patterns. Matching files are skipped.',
	},
	{
		displayName: 'Include Patterns',
		name: 'includePatterns',
		type: 'string',
		default: '',
		placeholder: 'e.g. *.pdf, contracts/**',
		description: 'Comma-separated glob patterns. When set, only matching files are synced.',
	},
	{
		displayName: 'When a File Is Deleted',
		name: 'deletionPolicy',
		type: 'options',
		options: [
			{ name: 'Remove It From the Collection', value: 'mirror' },
			{
				name: 'Archive It',
				value: 'archive',
				description: 'Hide it from search but keep it, so a search can still include it on request',
			},
			{ name: 'Keep It', value: 'ignore' },
		],
		default: 'mirror',
	},
	{
		displayName: 'Check Every (Minutes)',
		name: 'syncIntervalMinutes',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 60,
		description:
			'How often to look for changes, at least 5. Set 0 to sync only when you use Run Now.',
	},
];

export const syncFields: INodeProperties[] = [
	collectionLocator(createShow, { description: 'The collection the sync keeps up to date' }),
	{
		displayName: 'Bucket Name',
		name: 'bucket',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { ...show, operation: CREATE_OPS.filter((o) => o !== 'sync_azure') } },
	},
	{
		displayName: 'Container Name',
		name: 'bucket',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { ...show, operation: ['sync_azure'] } },
	},
	{
		displayName: 'Folder Prefix',
		name: 'prefix',
		type: 'string',
		default: '',
		placeholder: 'e.g. docs/2024/',
		description: 'Only sync files under this prefix. Leave empty for the whole bucket.',
		displayOptions: { show: createShow },
	},
	processingTypeField(createShow),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: createShow },
		options: [...patternsAndPolicy, customMetadataOption].sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		),
	},
	idLocator(
		'syncId',
		'Sync',
		'searchSyncs',
		{ ...show, operation: ['delete', 'get', 'reconcile', 'update'] },
		'Pick one of your syncs, or pass a sync_id',
		'e.g. sync_1468f61a7ff44ad4b947',
	),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { ...show, operation: ['update'] } },
		options: (
			[
				...patternsAndPolicy,
				customMetadataOption,
				{
					displayName: 'Folder Prefix',
					name: 'prefix',
					type: 'string',
					default: '',
				},
				{
					displayName: 'Status',
					name: 'status',
					type: 'options',
					options: [
						{ name: 'Active', value: 'active' },
						{ name: 'Paused', value: 'paused' },
					],
					default: 'paused',
					description: 'Paused stops syncing without deleting anything',
				},
			] as INodeProperties[]
		).sort((a, b) => a.displayName.localeCompare(b.displayName)),
	},
	simplifyField({
		...show,
		operation: [...CREATE_OPS, 'get', 'getMany', 'update'],
	}),
];
