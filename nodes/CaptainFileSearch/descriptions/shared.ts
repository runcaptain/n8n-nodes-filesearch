import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

type Show = NonNullable<NonNullable<INodeProperties['displayOptions']>['show']>;

export function collectionLocator(
	show: Show,
	overrides: Partial<INodeProperties> = {},
): INodeProperties {
	return {
		displayName: 'Collection',
		name: 'collection',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The collection to work with',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchCollections', searchable: true },
			},
			{
				displayName: 'By Name',
				name: 'name',
				type: 'string',
				placeholder: 'e.g. contracts',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[A-Za-z0-9][A-Za-z0-9_.-]*$',
							errorMessage: 'Use letters, numbers, dots, dashes and underscores',
						},
					},
				],
			},
		],
		displayOptions: { show },
		...overrides,
	};
}

/** A pick-from-list or paste-an-ID field, filled by one of the node's listSearch methods. */
export function idLocator(
	name: string,
	displayName: string,
	searchListMethod: string,
	show: Show,
	description: string,
	placeholder: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod, searchable: true },
			},
			{ displayName: 'By ID', name: 'id', type: 'string', placeholder },
		],
		displayOptions: { show },
	};
}

export function simplifyField(show: Show): INodeProperties {
	return {
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show },
	};
}

export const processingTypeOptions: INodePropertyOptions[] = [
	{
		name: 'Auto',
		value: 'auto',
		description:
			'Uses advanced processing only for PDFs with photos, drawings, tables or scanned pages, and basic for the rest',
	},
	{
		name: 'Basic',
		value: 'basic',
		description: 'Text and layout extraction. Fastest and cheapest.',
	},
	{
		name: 'Advanced',
		value: 'advanced',
		description:
			'Agentic OCR for complex layouts, tables, figures and charts. Billed as advanced pages.',
	},
];

export function processingTypeField(show: Show): INodeProperties {
	return {
		displayName: 'Processing',
		name: 'processingType',
		type: 'options',
		options: processingTypeOptions,
		default: 'auto',
		description: 'How deeply File Search reads each document',
		displayOptions: { show },
	};
}

export const customMetadataOption: INodeProperties = {
	displayName: 'Custom Metadata',
	name: 'customMetadata',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Metadata Field',
	default: {},
	description:
		'Fields attached to every chunk from this job. You can filter and boost on them when you search.',
	options: [
		{
			displayName: 'Field',
			name: 'values',
			values: [
				{
					displayName: 'Field',
					name: 'key',
					type: 'string',
					default: '',
					placeholder: 'e.g. department',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'string',
					default: '',
					placeholder: 'e.g. legal',
				},
			],
		},
	],
};

export const ifExistsOption: INodeProperties = {
	displayName: 'If Already Indexed',
	name: 'ifExists',
	type: 'options',
	options: [
		{
			name: 'Skip',
			value: 'skip',
			description: 'Leave files that are already in the collection as they are',
		},
		{
			name: 'Replace',
			value: 'replace',
			description: 'Re-index changed files and swap them in with no downtime',
		},
		{
			name: 'Index Again',
			value: 'duplicate',
			description: 'Index every file, even ones already in the collection',
		},
	],
	default: 'skip',
};

export const maskPiiOptions: INodeProperties[] = [
	{
		displayName: 'Mask Personal Data',
		name: 'maskPii',
		type: 'boolean',
		default: false,
		description:
			'Whether to mask emails, phone numbers, SSNs, card numbers, names and locations before the text is stored',
	},
	{
		displayName: 'Masking Engine',
		name: 'piiEngine',
		type: 'options',
		options: [
			{ name: 'Kev (Default)', value: 'kev' },
			{ name: 'Jev', value: 'jev' },
			{ name: 'Presidio', value: 'presidio' },
		],
		default: 'kev',
		description: 'Used only when Mask Personal Data is on',
	},
	{
		displayName: 'Masking Instructions',
		name: 'piiInstructions',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description:
			'Plain-language guidance on what counts as personal data for this job. Used only when Mask Personal Data is on.',
	},
];

export const parsingScriptOption: INodeProperties = {
	displayName: 'JSON Parsing Script',
	name: 'parsingScript',
	type: 'string',
	default: '',
	placeholder: 'e.g. research/paper-parser',
	description: 'Path of a parsing script that File Search runs on .JSON files',
};

export const transcriptionLanguageOption: INodeProperties = {
	displayName: 'Audio Language',
	name: 'transcriptionLanguage',
	type: 'string',
	default: '',
	placeholder: 'e.g. es-US',
	description: 'Language code for audio and video. Leave empty to detect it per file.',
};

export function waitFields(show: Show): INodeProperties[] {
	return [
		{
			displayName: 'Wait for Completion',
			name: 'waitForCompletion',
			type: 'boolean',
			default: true,
			description:
				'Whether to poll the job until indexing finishes and return the finished job. The files are processed by File Search, not by n8n. Off returns the job ID right away.',
			displayOptions: { show },
		},
		{
			displayName: 'Timeout (Seconds)',
			name: 'waitTimeout',
			type: 'number',
			typeOptions: { minValue: 10 },
			default: 3600,
			description:
				'Stop polling after this long and return the job as it is. The job keeps running. For very large jobs, turn waiting off and use the Captain File Search Trigger instead.',
			displayOptions: { show: { ...show, waitForCompletion: [true] } },
		},
	];
}
