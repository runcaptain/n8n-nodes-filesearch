import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CaptainMicrosoft365Api implements ICredentialType {
	name = 'captainMicrosoft365Api';

	displayName = 'Captain File Search: Microsoft 365 API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName:
				'Used for SharePoint and OneDrive. Create an Entra ID app registration with the Sites.Read.All and Files.Read.All application permissions, and grant admin consent.',
			name: 'notice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Tenant ID',
			name: 'tenantId',
			type: 'string',
			default: '',
			required: true,
			description: 'Directory (tenant) ID, a GUID, or your tenant domain',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'Application (client) ID of the app registration',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: '=https://login.microsoftonline.com/{{encodeURIComponent($credentials.tenantId)}}/oauth2/v2.0/token',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: '=client_id={{encodeURIComponent($credentials.clientId)}}&client_secret={{encodeURIComponent($credentials.clientSecret)}}&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default&grant_type=client_credentials',
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 400,
					message:
						'Microsoft did not accept these values. Check the tenant ID and client ID, and that the client secret has not expired.',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 401,
					message:
						'Microsoft rejected the client secret. Create a new secret in the app registration and paste it here.',
				},
			},
		],
	};
}
