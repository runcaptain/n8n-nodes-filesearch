import type { INodeProperties } from 'n8n-workflow';

import { collectionLocator } from './shared';

export const collectionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['collection'] } },
		options: [
			{
				name: 'Copy Collection',
				value: 'copy',
				description: 'Copy a collection and its documents under a new name',
				action: 'Copy collection',
			},
			{
				name: 'Create Collection',
				value: 'create',
				description: 'Create a new, empty collection',
				action: 'Create collection',
			},
			{
				name: 'Delete Collection',
				value: 'delete',
				description: 'Delete a collection and every document in it permanently',
				action: 'Delete collection',
			},
			{
				name: 'Get Many Collections',
				value: 'getMany',
				description: 'Retrieve a list of your collections',
				action: 'Get many collections',
			},
		],
		default: 'getMany',
	},
];

const show = { resource: ['collection'] };

export const collectionFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. contracts',
		description: 'Letters, numbers, dots, dashes and underscores',
		displayOptions: { show: { ...show, operation: ['create'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { ...show, operation: ['create'] } },
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Fail If It Exists',
				name: 'failIfExists',
				type: 'boolean',
				default: false,
				description:
					'Whether to stop with an error when the name is taken. Off returns the existing collection, which lets a workflow create its collection on every run.',
			},
		],
	},
	collectionLocator({ ...show, operation: ['copy', 'delete'] }),
	{
		displayName: 'New Name',
		name: 'targetName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { ...show, operation: ['copy'] } },
	},
	{
		displayName: 'Copy Graph and Chunk Metadata',
		name: 'includeGraph',
		type: 'boolean',
		default: true,
		description: 'Whether to copy chunk relations and chunk metadata too',
		displayOptions: { show: { ...show, operation: ['copy'] } },
	},
	{
		displayName: 'This deletes the collection and every document in it. It cannot be undone.',
		name: 'deleteNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { ...show, operation: ['delete'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { ...show, operation: ['getMany'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...show, operation: ['getMany'], returnAll: [false] } },
	},
];
