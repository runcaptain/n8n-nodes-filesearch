import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

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
			placeholder: 'e.g. https://<project_ref>.storage.supabase.co/storage/v1/s3',
			required: true,
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'string',
			default: 'us-east-1',
			description: 'The region shown on the Storage → S3 Connection page',
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
}
