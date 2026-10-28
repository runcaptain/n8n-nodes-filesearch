import type { INodeProperties } from 'n8n-workflow';

import { collectionLocator } from './shared';

export const searchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['search'] } },
		options: [
			{
				name: 'Search Collection',
				value: 'query',
				description: 'Find the passages in one collection that answer a question',
				action: 'Search collection',
			},
			{
				name: 'Search Multiple Collections',
				value: 'batchQuery',
				description: 'Ask one question across up to 10 collections at once',
				action: 'Search multiple collections',
			},
		],
		default: 'query',
	},
];

const show = { resource: ['search'] };

const searchOptions: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: { show },
	options: [
		{
			displayName: 'Exclude Chunk Types',
			name: 'excludeChunkTypes',
			type: 'multiOptions',
			options: [
				{ name: 'Body', value: 'body' },
				{ name: 'Figure', value: 'figure' },
				{ name: 'Footnote', value: 'footnote' },
				{ name: 'Heading', value: 'heading' },
				{ name: 'Page Footer', value: 'page_footer' },
				{ name: 'Page Header', value: 'page_header' },
				{ name: 'Table', value: 'table' },
			],
			default: [],
			description: 'Layout roles to leave out of the results, such as page headers and footers',
		},
		{
			displayName: 'Include',
			name: 'include',
			type: 'multiOptions',
			options: [
				{ name: 'Archived Chunks', value: 'archived' },
				{ name: 'Document Metadata', value: 'document_metadata' },
				{ name: 'Graph Relations', value: 'relations' },
				{ name: 'Layout Regions', value: 'regions' },
				{ name: 'Neighboring Chunks', value: 'neighboring_chunks' },
				{ name: 'Related Chunks', value: 'related_chunks' },
			],
			default: [],
			description: 'Extra context to return with each result. Each one adds some latency.',
		},
		{
			displayName: 'Keyword vs Semantic Balance',
			name: 'semanticRatio',
			type: 'number',
			typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
			default: 0.5,
			description:
				'0 is keyword matching only, 1 is meaning only. 0.5 blends both, which suits most questions.',
		},
		{
			displayName: 'Max Results per Document',
			name: 'maxChunksPerDocument',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 3,
			description: 'Cap how many results one document can take, so the results cover more files',
		},
		{
			displayName: 'Metadata Filter (JSON)',
			name: 'filter',
			type: 'json',
			default: '{}',
			placeholder: 'e.g. {"department": {"$eq": "legal"}}',
			hint: 'e.g. {"department": {"$eq": "legal"}}',
			description:
				'Only search documents whose custom metadata match. Supports $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and and $or.',
		},
		{
			displayName: 'Rerank',
			name: 'rerank',
			type: 'boolean',
			default: false,
			description:
				'Whether to rerank the candidates with a cross-encoder for better ordering. Adds about 200 ms.',
		},
	],
};

export const searchFields: INodeProperties[] = [
	collectionLocator({ ...show, operation: ['query'] }),
	{
		displayName: 'Collection Names or IDs',
		name: 'collections',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getCollectionNames' },
		required: true,
		default: [],
		description:
			'Up to 10 collections to search. Choose from the list, or specify names using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { ...show, operation: ['batchQuery'] } },
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. What is the termination notice period?',
		description: 'A question or phrase in plain language',
		displayOptions: { show },
	},
	{
		displayName: 'Max Results',
		name: 'maxResults',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 10,
		description: 'How many passages to return',
		displayOptions: { show: { ...show, operation: ['query'] } },
	},
	{
		displayName: 'Max Results per Collection',
		name: 'maxResults',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 5,
		description: 'Max number of results to return from each collection',
		displayOptions: { show: { ...show, operation: ['batchQuery'] } },
	},
	{
		displayName: 'Output',
		name: 'output',
		type: 'options',
		options: [
			{
				name: 'Simplified',
				value: 'simplified',
				description: 'Return the text, score, file, page, IDs and metadata of each passage',
			},
			{
				name: 'Raw',
				value: 'raw',
				description: 'Return every field the API sends',
			},
			{
				name: 'Selected Fields',
				value: 'selected',
				description: 'Return only the fields you pick, plus the chunk and document IDs',
			},
		],
		default: 'simplified',
		description:
			'Each passage is returned as its own item. Fewer fields keep an AI agent focused and its context small.',
		displayOptions: { show },
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'multiOptions',
		options: [
			{ name: 'Chunk Type', value: 'chunk_type' },
			{ name: 'Collection', value: 'collection' },
			{ name: 'Custom Metadata', value: 'custom_metadata' },
			{ name: 'File Name', value: 'filename' },
			{ name: 'Layout Regions', value: 'regions' },
			{ name: 'Neighboring Chunks', value: 'neighboring_chunks' },
			{ name: 'Page End', value: 'page_end' },
			{ name: 'Page Start', value: 'page_start' },
			{ name: 'Related Chunks', value: 'related_chunks' },
			{ name: 'Relations', value: 'relations' },
			{ name: 'Rerank Score', value: 'rerank_score' },
			{ name: 'Score', value: 'score' },
			{ name: 'Sheet Name', value: 'sheet_name' },
			{ name: 'Source', value: 'source' },
			{ name: 'Start Time (Seconds)', value: 'start_seconds' },
			{ name: 'Text', value: 'text' },
		],
		default: ['text', 'filename'],
		description: 'The fields to return. The chunk and document IDs are always included.',
		displayOptions: { show: { ...show, output: ['selected'] } },
	},
	searchOptions,
];
