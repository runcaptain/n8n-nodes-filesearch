import type { INodeProperties } from 'n8n-workflow';

import { idLocator, simplifyField } from './shared';

export const jobOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['job'] } },
		options: [
			{
				name: 'Cancel Job',
				value: 'cancel',
				description: 'Stop a running indexing job',
				action: 'Cancel job',
			},
			{
				name: 'Get Job',
				value: 'get',
				description: 'Retrieve the status and progress of an indexing job',
				action: 'Get job',
			},
			{
				name: 'Get Many Jobs',
				value: 'getMany',
				description: 'Retrieve a list of indexing jobs, newest first',
				action: 'Get many jobs',
			},
			{
				name: 'Wait for Job to Finish',
				value: 'wait',
				description: 'Poll an indexing job until it ends, then return the finished job',
				action: 'Wait for job to finish',
			},
		],
		default: 'get',
	},
];

const show = { resource: ['job'] };

export const jobFields: INodeProperties[] = [
	idLocator(
		'jobId',
		'Job',
		'searchJobs',
		{ ...show, operation: ['cancel', 'get', 'wait'] },
		'Pick a recent job, or map the job_id returned by an Index action',
		'e.g. {{ $json.job_id }}',
	),
	{
		displayName: 'Timeout (Seconds)',
		name: 'waitTimeout',
		type: 'number',
		typeOptions: { minValue: 10 },
		default: 3600,
		description: 'Stop waiting after this long and return the job as it is. The job keeps running.',
		displayOptions: { show: { ...show, operation: ['wait'] } },
	},
	{
		displayName: 'Fail on Job Error',
		name: 'failOnError',
		type: 'boolean',
		default: false,
		description: 'Whether to stop the workflow when the job ends as failed, cancelled or timed out',
		displayOptions: { show: { ...show, operation: ['wait'] } },
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
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { ...show, operation: ['getMany'] } },
		options: [
			{
				displayName: 'Collection',
				name: 'collection',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				description: 'Only jobs for this collection',
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
					},
				],
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Cancelled', value: 'cancelled' },
					{ name: 'Completed', value: 'completed' },
					{ name: 'Completed With Errors', value: 'completed_with_errors' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Pending', value: 'pending' },
					{ name: 'Processing', value: 'processing' },
					{ name: 'Running', value: 'running' },
					{ name: 'Timed Out', value: 'timed_out' },
				],
				default: 'running',
			},
		],
	},
	simplifyField({ ...show, operation: ['get', 'getMany', 'wait'] }),
];
