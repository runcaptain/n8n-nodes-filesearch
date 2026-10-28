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

export class CaptainAwsS3Api implements ICredentialType {
	name = 'captainAwsS3Api';

	displayName = 'Captain File Search: Amazon S3 API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName:
				'File Search reads your bucket with these credentials. They are sent to File Search with each request and are not stored there.',
			name: 'notice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authType',
			type: 'options',
			options: [
				{
					name: 'Access Key',
					value: 'accessKey',
					description:
						'An IAM user access key with read access to the bucket. Lets n8n list your buckets, folders and files.',
				},
				{
					name: 'IAM Role',
					value: 'role',
					description:
						'Captain assumes a role in your account, so no long-lived keys leave it. You type bucket and folder names yourself.',
				},
			],
			default: 'accessKey',
		},
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { authType: ['accessKey'] } },
		},
		{
			displayName: 'Secret Access Key',
			name: 'secretAccessKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			displayOptions: { show: { authType: ['accessKey'] } },
		},
		{
			displayName: 'Role ARN',
			name: 'roleArn',
			type: 'string',
			default: '',
			placeholder: 'e.g. arn:aws:iam::123456789012:role/captain-read',
			required: true,
			displayOptions: { show: { authType: ['role'] } },
		},
		{
			displayName: 'External ID',
			name: 'externalId',
			type: 'string',
			default: '',
			required: true,
			description: 'The external ID in the role trust policy',
			displayOptions: { show: { authType: ['role'] } },
		},
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			options: AWS_REGION_CHOICES,
			default: 'us-east-1',
			description: 'Region of the buckets you index with this credential',
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
	];

	/** Signs bucket and file listing requests (SigV4). Indexing requests go to File Search, not here. */
	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		if (credentials.authType === 'role') {
			throw new Error(
				'Listing needs an access key credential. With an IAM role, type the bucket and path instead.',
			);
		}
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
