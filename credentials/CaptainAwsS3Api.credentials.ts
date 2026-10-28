import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CaptainAwsS3Api implements ICredentialType {
	name = 'captainAwsS3Api';

	displayName = 'Captain File Search: Amazon S3';

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
					description: 'An IAM user access key with read access to the bucket',
				},
				{
					name: 'IAM Role',
					value: 'role',
					description:
						'Captain assumes a role in your account. No long-lived keys leave your account.',
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
			type: 'string',
			default: 'us-east-1',
			description: 'Region of the buckets you index with this credential',
		},
	];
}
