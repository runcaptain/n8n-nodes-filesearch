import type {
	ICredentialDataDecryptedObject,
	Icon,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import {
	credentialRegion,
	regionFromHost,
	sigV4Headers,
} from '../nodes/CaptainFileSearch/storage/signing';
import { AWS_REGION_CHOICES } from '../nodes/CaptainFileSearch/storage/lists';

export class CaptainSupabaseStorageApi implements ICredentialType {
	name = 'captainSupabaseStorageApi';

	displayName = 'Captain File Search: Supabase Storage API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName: 'Endpoint URL',
			name: 'endpointUrl',
			type: 'string',
			default: '',
			placeholder: 'e.g. https://abcdefghijklmnop.storage.supabase.co/storage/v1/s3',
			required: true,
			description: "Shown on your project's Storage → S3 Connection page",
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			options: AWS_REGION_CHOICES,
			default: 'us-east-1',
			description: 'The region shown on the Storage → S3 Connection page',
		},
		{
			displayName: 'Region Code',
			name: 'customRegion',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. ca-west-1',
			displayOptions: { show: { region: ['other'] } },
		},
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
			required: true,
			description: 'Storage → S3 Connection → access key ID',
		},
		{
			displayName: 'Secret Access Key',
			name: 'secretAccessKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];

	/** Signs bucket and file listing requests (SigV4). Indexing requests go to File Search, not here. */
	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const url = String(requestOptions.url);
		const host = new URL(url).host;
		return {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				...sigV4Headers(
					String(requestOptions.method ?? 'GET'),
					url,
					regionFromHost(host, credentialRegion(credentials)),
					String(credentials.accessKeyId),
					String(credentials.secretAccessKey),
				),
			},
		};
	}
}
