import type {
	ICredentialDataDecryptedObject,
	Icon,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import { azureSharedKeyHeaders } from '../nodes/CaptainFileSearch/storage/signing';

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

	/** Signs container and blob listing requests (Shared Key). Indexing requests go to File Search, not here. */
	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		return {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				...azureSharedKeyHeaders(
					String(requestOptions.url),
					String(credentials.accountName),
					String(credentials.accountKey),
				),
			},
		};
	}
}
