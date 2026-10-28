import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CaptainAzureBlobApi implements ICredentialType {
	name = 'captainAzureBlobApi';

	displayName = 'Captain File Search: Azure Blob Storage API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName: 'Storage Account Name',
			name: 'accountName',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Account Key',
			name: 'accountKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Key1 or key2 from the storage account Access Keys page',
		},
	];
}
