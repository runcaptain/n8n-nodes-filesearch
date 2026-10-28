import type { INodeProperties } from 'n8n-workflow';

import { processingTypeOptions } from './shared';

export const parseOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['parse'] } },
		options: [
			{
				name: 'Get Parse Job',
				value: 'getParseJob',
				description: 'Retrieve the status and result of a parse job',
				action: 'Get parse job',
			},
			{
				name: 'Parse File',
				value: 'parse',
				description:
					'Turn a PDF, Office file, image or spreadsheet into structured chunks without indexing it',
				action: 'Parse file',
			},
		],
		default: 'parse',
	},
];

const show = { resource: ['parse'], operation: ['parse'] };

export const parseFields: INodeProperties[] = [
	{
		displayName: 'File Type',
		name: 'parseType',
		type: 'options',
		options: [
			{
				name: 'Document',
				value: 'documents',
				description: 'PDF, Word, PowerPoint, images and text',
			},
			{ name: 'Spreadsheet', value: 'spreadsheets', description: 'Excel and CSV' },
		],
		default: 'documents',
		displayOptions: { show },
	},
	{
		displayName: 'Input',
		name: 'inputType',
		type: 'options',
		options: [
			{ name: 'Binary File', value: 'binary', description: 'A file from a previous node' },
			{ name: 'URL', value: 'url', description: 'A public or presigned download link' },
		],
		default: 'binary',
		displayOptions: { show },
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input field holding the file',
		displayOptions: { show: { ...show, inputType: ['binary'] } },
	},
	{
		displayName: 'File URL',
		name: 'fileUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/report.pdf',
		displayOptions: { show: { ...show, inputType: ['url'] } },
	},
	{
		displayName: 'Processing',
		name: 'processingType',
		type: 'options',
		options: processingTypeOptions,
		default: 'basic',
		displayOptions: { show: { ...show, parseType: ['documents'] } },
	},
	{
		displayName: 'Wait for Result',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait for parsing to finish and return the chunks. Off returns the job ID right away.',
		displayOptions: { show },
	},
	{
		displayName: 'Timeout (Seconds)',
		name: 'waitTimeout',
		type: 'number',
		typeOptions: { minValue: 10 },
		default: 600,
		displayOptions: { show: { ...show, waitForCompletion: [true] } },
	},
	{
		displayName: 'Return Chunks As',
		name: 'output',
		type: 'options',
		options: [
			{ name: 'Single Item', value: 'single', description: 'The whole parse result as one item' },
			{
				name: 'One Item per Chunk',
				value: 'split',
				description: 'Each chunk becomes its own item',
			},
		],
		default: 'single',
		displayOptions: { show: { ...show, waitForCompletion: [true] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Include Images',
				name: 'includeImages',
				type: 'boolean',
				default: false,
				description: 'Whether to return images embedded in the sheets. Spreadsheets only.',
			},
			{
				displayName: 'Include Tags and Summary',
				name: 'includeTagsSummary',
				type: 'boolean',
				default: false,
				description: 'Whether each chunk also carries generated tags and a summary',
			},
			{
				displayName: 'Include Verified Facts',
				name: 'includeVerifiedFacts',
				type: 'boolean',
				default: false,
				description: 'Whether to return facts checked against the cell values. Spreadsheets only.',
			},
		],
	},
	{
		displayName: 'Parse Job ID',
		name: 'parseJobId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['parse'], operation: ['getParseJob'] } },
	},
];
