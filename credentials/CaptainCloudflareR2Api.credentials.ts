import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

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
}
