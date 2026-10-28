import type {
	ICredentialDataDecryptedObject,
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { runOperation } from './actions';
import { collectionFields, collectionOperations } from './descriptions/CollectionDescription';
import { documentFields, documentOperations } from './descriptions/DocumentDescription';
import { indexFields, indexOperations } from './descriptions/IndexDescription';
import { jobFields, jobOperations } from './descriptions/JobDescription';
import { parseFields, parseOperations } from './descriptions/ParseDescription';
import { searchFields, searchOperations } from './descriptions/SearchDescription';
import { syncFields, syncOperations } from './descriptions/SyncDescription';
import {
	asNodeError,
	searchCollections,
	searchDocuments,
	searchJobs,
	searchSyncs,
} from './GenericFunctions';

/** Credential checks that need no network call: the API validates storage access when a job starts. */
function checkStorageCredential(
	type: string,
	data: ICredentialDataDecryptedObject,
): string | undefined {
	const missing = (keys: string[]) => keys.filter((k) => !String(data[k] ?? '').trim());
	switch (type) {
		case 'captainAwsS3Api': {
			const gaps =
				data.authType === 'role'
					? missing(['roleArn', 'externalId'])
					: missing(['accessKeyId', 'secretAccessKey']);
			if (gaps.length) return `Missing ${gaps.join(', ')}`;
			if (
				data.authType === 'role' &&
				!/^arn:aws[a-z-]*:iam::\d{12}:role\/.+/.test(String(data.roleArn))
			) {
				return 'Role ARN should look like arn:aws:iam::123456789012:role/name';
			}
			if (
				data.authType !== 'role' &&
				!/^(AKIA|ASIA)[A-Z0-9]{12,}$/.test(String(data.accessKeyId).trim())
			) {
				return 'Access Key ID should start with AKIA or ASIA';
			}
			return undefined;
		}
		case 'captainGoogleServiceAccountApi': {
			try {
				const key = JSON.parse(String(data.serviceAccountJson)) as Record<string, unknown>;
				if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
					return 'This JSON is not a service account key. It needs type, client_email and private_key.';
				}
			} catch {
				return 'Service Account JSON is not valid JSON';
			}
			return undefined;
		}
		case 'captainAzureBlobApi': {
			const gaps = missing(['accountName', 'accountKey']);
			if (gaps.length) return `Missing ${gaps.join(', ')}`;
			if (!/^[a-z0-9]{3,24}$/.test(String(data.accountName))) {
				return 'Storage account names are 3 to 24 lowercase letters and numbers';
			}
			return undefined;
		}
		case 'captainCloudflareR2Api': {
			const gaps = missing(['accountId', 'accessKeyId', 'secretAccessKey']);
			if (gaps.length) return `Missing ${gaps.join(', ')}`;
			if (!/^[a-f0-9]{32}$/.test(String(data.accountId).trim())) {
				return 'Account ID should be the 32-character ID from the Cloudflare dashboard';
			}
			return undefined;
		}
		case 'captainSupabaseStorageApi':
		case 'captainBackblazeB2Api': {
			const gaps = missing(['endpointUrl', 'accessKeyId', 'secretAccessKey']);
			if (gaps.length) return `Missing ${gaps.join(', ')}`;
			if (!/^https:\/\//.test(String(data.endpointUrl).trim()))
				return 'Endpoint URL must start with https://';
			return undefined;
		}
	}
	return undefined;
}

export class CaptainFileSearch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Captain File Search',
		name: 'captainFileSearch',
		icon: { light: 'file:captain.png', dark: 'file:captain.png' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Index files from storage, drives and uploads, search them in plain language, and read documents back',
		defaults: { name: 'Captain File Search' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{ name: 'captainFileSearchApi', required: true },
			{
				name: 'captainAwsS3Api',
				required: true,
				testedBy: 'storageCredentialTest',
				displayOptions: { show: { operation: ['s3', 'sync_s3'] } },
			},
			{
				name: 'captainGoogleServiceAccountApi',
				required: true,
				testedBy: 'storageCredentialTest',
				displayOptions: { show: { operation: ['gcs', 'gdrive', 'sync_gcs'] } },
			},
			{
				name: 'captainAzureBlobApi',
				required: true,
				testedBy: 'storageCredentialTest',
				displayOptions: { show: { operation: ['azure', 'sync_azure'] } },
			},
			{
				name: 'captainCloudflareR2Api',
				required: true,
				testedBy: 'storageCredentialTest',
				displayOptions: { show: { operation: ['r2', 'sync_r2'] } },
			},
			{
				name: 'captainSupabaseStorageApi',
				required: true,
				testedBy: 'storageCredentialTest',
				displayOptions: { show: { operation: ['supabase', 'sync_supabase'] } },
			},
			{
				name: 'captainBackblazeB2Api',
				required: true,
				testedBy: 'storageCredentialTest',
				displayOptions: { show: { operation: ['backblaze', 'sync_backblaze'] } },
			},
			{
				name: 'captainMicrosoft365Api',
				required: true,
				displayOptions: { show: { operation: ['sharepoint', 'onedrive'] } },
			},
			{
				name: 'captainDropboxApi',
				required: true,
				displayOptions: { show: { operation: ['dropbox'] } },
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Collection', value: 'collection' },
					{ name: 'Document', value: 'document' },
					{ name: 'Index', value: 'index' },
					{ name: 'Job', value: 'job' },
					{ name: 'Parse', value: 'parse' },
					{ name: 'Search', value: 'search' },
					{ name: 'Sync', value: 'sync' },
				],
				default: 'search',
			},
			...searchOperations,
			...searchFields,
			...indexOperations,
			...indexFields,
			...documentOperations,
			...documentFields,
			...collectionOperations,
			...collectionFields,
			...jobOperations,
			...jobFields,
			...syncOperations,
			...syncFields,
			...parseOperations,
			...parseFields,
		],
	};

	methods = {
		listSearch: { searchCollections, searchDocuments, searchJobs, searchSyncs },
		loadOptions: {
			async getCollectionNames(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const { results } = await searchCollections.call(this);
				return results.map((r) => ({ name: r.name, value: String(r.value) }));
			},
		},
		credentialTest: {
			async storageCredentialTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const problem = checkStorageCredential(credential.type, credential.data ?? {});
				if (problem) return { status: 'Error', message: problem };
				return {
					status: 'OK',
					message: 'Looks valid. File Search checks access to the bucket when a job starts.',
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				returnData.push(...(await runOperation.call(this, resource, operation, i)));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw asNodeError(this.getNode(), error, i);
			}
		}

		return [returnData];
	}
}
