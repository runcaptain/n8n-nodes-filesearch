import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CaptainBackblazeB2Api implements ICredentialType {
	name = 'captainBackblazeB2Api';

	displayName = 'Captain File Search: Backblaze B2 API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName: 'Endpoint URL',
			name: 'endpointUrl',
			type: 'string',
			default: '',
			placeholder: 'e.g. https://s3.us-west-004.backblazeb2.com',
			required: true,
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'string',
			default: 'us-east-1',
			description: 'The region in your endpoint URL, for example us-west-004',
		},
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
			required: true,
			description: 'The Application Key ID',
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
}
