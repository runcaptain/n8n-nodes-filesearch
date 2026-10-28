import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	Icon,
	ICredentialType,
	IDataObject,
	IHttpRequestHelper,
	INodeProperties,
} from 'n8n-workflow';

import { googleJwtAssertion } from '../nodes/CaptainFileSearch/storage/signing';

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
				'Google Drive only. The Workspace user whose Drive is indexed. Leave empty for Cloud Storage.',
		},
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'hidden',
			typeOptions: { expirable: true, password: true },
			default: '',
		},
	];

	/**
	 * Mints a short-lived token for listing buckets and Drive files in the editor. With a Drive user
	 * set, the token reads that user's Drive; without one, it reads Cloud Storage.
	 */
	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		let key: { client_email: string; private_key: string };
		try {
			key = JSON.parse(String(credentials.serviceAccountJson));
		} catch {
			throw new Error('Service Account JSON is not valid JSON. Paste the whole key file.');
		}
		const subject = String(credentials.subjectEmail ?? '').trim();
		const scope = subject
			? 'https://www.googleapis.com/auth/drive.readonly'
			: 'https://www.googleapis.com/auth/devstorage.read_only';
		const assertion = googleJwtAssertion(
			key.client_email,
			key.private_key,
			scope,
			subject || undefined,
		);
		try {
			const response = (await this.helpers.httpRequest({
				method: 'POST',
				url: 'https://oauth2.googleapis.com/token',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
			})) as IDataObject;
			return { accessToken: response.access_token };
		} catch {
			throw new Error(
				subject
					? `Google did not issue a token for ${subject}. Check that domain-wide delegation grants this service account the drive.readonly scope.`
					: 'Google did not issue a token for this service account. Check that the key is active.',
			);
		}
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: { Authorization: '=Bearer {{$credentials.accessToken}}' },
		},
	};
}
