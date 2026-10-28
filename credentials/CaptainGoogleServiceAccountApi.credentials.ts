import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CaptainGoogleServiceAccountApi implements ICredentialType {
	name = 'captainGoogleServiceAccountApi';

	displayName = 'Captain File Search: Google Service Account API';

	icon: Icon = { light: 'file:captain.png', dark: 'file:captain.png' };

	documentationUrl = 'https://docs.filesearch.dev';

	properties: INodeProperties[] = [
		{
			displayName:
				'Used for Google Cloud Storage and Google Drive. For Drive, the service account needs domain-wide delegation with the drive.readonly scope.',
			name: 'notice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Service Account JSON',
			name: 'serviceAccountJson',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Paste the whole JSON key file you downloaded from Google Cloud. It stays masked, even though it is long.',
		},
		{
			displayName: 'Google Drive User Email',
			name: 'subjectEmail',
			type: 'string',
			placeholder: 'e.g. name@example.com',
			default: '',
			description:
				'Google Drive only. The Workspace user whose Drive is indexed. Not needed for Cloud Storage.',
		},
	];
}
