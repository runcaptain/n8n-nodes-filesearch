import type {
	ICredentialDataDecryptedObject,
	Icon,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import { regionFromHost, sigV4Headers } from '../nodes/CaptainFileSearch/storage/signing';

export class CaptainCloudflareR2Api implements ICredentialType {
	name = 'captainCloudflareR2Api';

	displayName = 'Captain File Search: Cloudflare R2 API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			required: true,
			description: 'Your Cloudflare account ID, shown in the R2 dashboard URL',
		},
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
			required: true,
			description: 'From an R2 API token with read access',
		},
		{
			displayName: 'Secret Access Key',
			name: 'secretAccessKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Jurisdiction',
			name: 'jurisdiction',
			type: 'options',
			options: [
				{ name: 'Default (Global)', value: 'default' },
				{ name: 'EU', value: 'eu' },
				{ name: 'FedRAMP', value: 'fedramp' },
				{ name: 'US', value: 'us' },
			],
			default: 'default',
			description: 'Must match the jurisdiction the bucket was created in',
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
					regionFromHost(host, 'auto'),
					String(credentials.accessKeyId),
					String(credentials.secretAccessKey),
				),
			},
		};
	}
}
