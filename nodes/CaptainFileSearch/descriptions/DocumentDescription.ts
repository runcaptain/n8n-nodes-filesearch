import type { INodeProperties } from 'n8n-workflow';

import { collectionLocator, idLocator, metadataFilterOptions, simplifyField } from './shared';

export const documentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['document'] } },
		options: [
			{
				name: 'Delete All Documents',
				value: 'deleteAll',
				description:
					'Delete every document in a collection permanently and keep the empty collection',
				action: 'Delete all documents in collection',
			},
			{
				name: 'Delete Document',
				value: 'delete',
				description: 'Delete a document and its chunks from a collection permanently',
				action: 'Delete document',
			},
			{
				name: 'Get Document',
				value: 'get',
				description: 'Retrieve a document and its parsed content from a collection',
				action: 'Get document',
			},
			{
				name: 'Get Document Chunks',
				value: 'getChunks',
				description: 'Retrieve the indexed chunks of a document, in reading order',
				action: 'Get document chunks',
			},
			{
				name: 'Get Document Page',
				value: 'getPage',
				description: 'Retrieve the content of one page of a document',
				action: 'Get document page',
			},
			{
				name: 'Get Many Documents',
				value: 'getMany',
				description: 'List the documents in a collection',
				action: 'Get many documents',
			},
			{
				name: 'Update Document Metadata',
				value: 'updateMetadata',
				description: 'Add or change custom metadata fields on a document and all its chunks',
				action: 'Update document metadata',
			},
		],
		default: 'getMany',
	},
];

const show = { resource: ['document'] };
const withDocument = ['delete', 'get', 'getChunks', 'getPage', 'updateMetadata'];

export const documentFields: INodeProperties[] = [
	collectionLocator(show),
	idLocator(
		'documentId',
		'Document',
		'searchDocuments',
		{ ...show, operation: withDocument },
		'Pick a file in the collection, or pass a document_id from a search result or Get Many',
		'e.g. 77e0bc19f37e92f16cd12f16c9510e6d',
	),
	{
		displayName: 'This deletes every document in the collection. It cannot be undone.',
		name: 'deleteAllNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { ...show, operation: ['deleteAll'] } },
	},
	{
		displayName: 'Page Number',
		name: 'pageNumber',
		type: 'number',
		typeOptions: { minValue: 1 },
		required: true,
		default: 1,
		displayOptions: { show: { ...show, operation: ['getPage'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { ...show, operation: ['getMany', 'getChunks'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...show, operation: ['getMany', 'getChunks'], returnAll: [false] } },
	},
	{
		displayName: 'Metadata',
		name: 'metadata',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Metadata Field',
		default: {},
		description: 'Fields to set. Fields you leave out keep their current values.',
		displayOptions: { show: { ...show, operation: ['updateMetadata'] } },
		options: [
			{
				displayName: 'Field',
				name: 'values',
				values: [
					{ displayName: 'Field', name: 'key', type: 'string', default: '' },
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { ...show, operation: ['getMany'] } },
		options: [
			...metadataFilterOptions,
			{
				displayName: 'Include Custom Metadata',
				name: 'includeCustomMetadata',
				type: 'boolean',
				default: false,
				description: "Whether to return each document's custom metadata",
			},
			{
				displayName: 'Advanced Filter (JSON)',
				name: 'metadataFilter',
				type: 'json',
				default: '{}',
				placeholder: 'e.g. {"department": {"$eq": "legal"}}',
				hint: 'e.g. {"department": {"$eq": "legal"}}',
				description:
					"For nested conditions the builder can't express. Combined with Metadata Filters using AND.",
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { ...show, operation: ['get', 'getPage', 'getChunks'] } },
		options: [
			{
				displayName: 'Include Layout Regions',
				name: 'includeRegions',
				type: 'boolean',
				default: false,
				description: 'Whether to return text blocks, tables and figures with their positions',
			},
			{
				displayName: 'Include Metadata',
				name: 'includeMetadata',
				type: 'boolean',
				default: true,
				description: 'Whether to return metadata. Not used by Get Page.',
			},
		],
	},
	simplifyField({ ...show, operation: ['getMany'] }),
];
