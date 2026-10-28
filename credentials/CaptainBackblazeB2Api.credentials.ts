import type {
	ICredentialDataDecryptedObject,
	Icon,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import { regionFromHost, sigV4Headers } from '../nodes/CaptainFileSearch/storage/signing';
import { BACKBLAZE_REGIONS } from '../nodes/CaptainFileSearch/storage/lists';

export class CaptainBackblazeB2Api implements ICredentialType {
	name = 'captainBackblazeB2Api';

	displayName = 'Captain File Search: Backblaze B2 API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			options: BACKBLAZE_REGIONS,
			default: 'us-west-004',
			description: "The region in your bucket's S3 endpoint, shown on the Buckets page",
		},
		{
			displayName: 'Application Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Application Key',
			name: 'secretAccessKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Shown once, when you create the key',
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
					regionFromHost(host, String(credentials.region ?? 'us-west-004')),
					String(credentials.accessKeyId),
					String(credentials.secretAccessKey),
				),
			},
		};
	}
}
