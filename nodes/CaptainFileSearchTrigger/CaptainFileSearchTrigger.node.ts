import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	asNodeError,
	getCollectionIds,
	getWebhookEventTypes,
} from '../CaptainFileSearch/GenericFunctions';

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Check a Standard Webhooks (Svix) signature: base64 HMAC-SHA256 of "id.timestamp.body",
 * keyed with the base64 part of the whsec_ secret. The header may carry several "v1,<sig>" entries.
 */
export function verifySignature(
	secret: string,
	headers: Record<string, string | string[] | undefined>,
	rawBody: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
	const header = (name: string) => {
		const value = headers[`webhook-${name}`] ?? headers[`svix-${name}`];
		return Array.isArray(value) ? value[0] : value;
	};
	const id = header('id');
	const timestamp = header('timestamp');
	const signatures = header('signature');
	if (!id || !timestamp || !signatures || !secret) return false;
	if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
	return signatures.split(' ').some((entry) => {
		const [version, signature] = entry.split(',');
		if (version !== 'v1' || !signature) return false;
		const given = Buffer.from(signature, 'base64');
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}

export class CaptainFileSearchTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Captain File Search Trigger',
		name: 'captainFileSearchTrigger',
		icon: { light: 'file:captain.png', dark: 'file:captain.png' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Index, search and read files with File Search, and start workflows when indexing or parse jobs finish',
		defaults: { name: 'Captain File Search Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'captainFileSearchApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'File Search sends events only to public HTTPS URLs, so this n8n instance must be reachable from the internet over HTTPS',
				name: 'httpsNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Event Names or IDs',
				name: 'events',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getEventTypes' },
				required: true,
				default: ['job.completed'],
				description:
					'Which job outcomes start the workflow. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Collection Names or IDs',
						name: 'collectionIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getCollections' },
						default: [],
						description:
							'Only jobs for these collections (up to 10). Leave empty for every collection. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Started By',
						name: 'sources',
						type: 'multiOptions',
						options: [
							{
								name: 'API Call',
								value: 'api',
								description: 'Jobs started by an Index operation or API call',
							},
							{
								name: 'Storage Sync',
								value: 'sync',
								description: 'Jobs started by a continuous sync',
							},
						],
						default: [],
						description: 'Leave empty for both',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getEventTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getWebhookEventTypes.call(this);
			},
			async getCollections(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getCollectionIds.call(this);
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.endpointId) return false;
				try {
					const endpoint = (await apiRequest.call(
						this,
						'GET',
						`/v2/webhooks/endpoints/${encodeURIComponent(String(data.endpointId))}`,
					)) as IDataObject;
					if (
						endpoint.url === this.getNodeWebhookUrl('default') &&
						data.secret &&
						!endpoint.disabled
					) {
						return true;
					}
					// Stale (n8n's public URL changed) or disabled after failed deliveries:
					// remove it so endpoints don't pile up against the per-org limit, then recreate.
					await apiRequest.call(
						this,
						'DELETE',
						`/v2/webhooks/endpoints/${encodeURIComponent(String(data.endpointId))}`,
					);
				} catch (error) {
					if (Number((error as IDataObject).httpCode) !== 404)
						throw asNodeError(this.getNode(), error);
				}
				delete data.endpointId;
				delete data.secret;
				return false;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const options = this.getNodeParameter('options', {}) as IDataObject;
				const body: IDataObject = {
					url: this.getNodeWebhookUrl('default'),
					event_types: this.getNodeParameter('events') as string[],
					description: `n8n: ${this.getWorkflow().name ?? this.getWorkflow().id}`.slice(0, 200),
				};
				const events = body.event_types as string[];
				const collectionIds = (options.collectionIds as string[] | undefined) ?? [];
				const sources = (options.sources as string[] | undefined) ?? [];
				if (collectionIds.length && events.some((e) => e.startsWith('parse.'))) {
					throw new NodeOperationError(
						this.getNode(),
						"Parse events can't match 'Collection Names or IDs', because parse jobs belong to no collection",
						{
							description:
								"Remove the parse events, or clear 'Collection Names or IDs' under Options",
						},
					);
				}
				if (collectionIds.length) body.collection_ids = collectionIds;
				// Both sources means every job, the same as no filter, and keeps the server's 10-filter cap clear.
				if (sources.length === 1) body.sources = sources;
				const endpoint = (await apiRequest.call(
					this,
					'POST',
					'/v2/webhooks/endpoints',
					body,
				)) as IDataObject;
				const data = this.getWorkflowStaticData('node');
				data.endpointId = endpoint.endpoint_id;
				data.secret = endpoint.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.endpointId) {
					try {
						await apiRequest.call(
							this,
							'DELETE',
							`/v2/webhooks/endpoints/${encodeURIComponent(String(data.endpointId))}`,
						);
					} catch (error) {
						if (Number((error as IDataObject).httpCode) !== 404) return false;
					}
				}
				delete data.endpointId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const secret = String(this.getWorkflowStaticData('node').secret ?? '');
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
		const rawBody = raw ? raw.toString('utf8') : JSON.stringify(this.getBodyData());
		if (!verifySignature(secret, this.getHeaderData() as Record<string, string>, rawBody)) {
			this.getResponseObject().status(401).send('Invalid signature');
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData())] };
	}
}
