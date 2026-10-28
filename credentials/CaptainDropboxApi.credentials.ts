import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CaptainDropboxApi implements ICredentialType {
	name = 'captainDropboxApi';

	displayName = 'Captain File Search: Dropbox API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A Dropbox access token with the files.metadata.read and files.content.read scopes, generated in the Dropbox App Console',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: 'https://api.dropboxapi.com/2/check/user',
			body: { query: 'n8n' },
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 401,
					message:
						'Dropbox rejected this access token. It may have expired. Generate a new token in the Dropbox App Console.',
				},
			},
		],
	};
}
