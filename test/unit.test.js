// Runs against the built package: `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const { objectUri, globList } = require('../dist/nodes/CaptainFileSearch/actions');
const {
	buildMultipart,
	dropEmpty,
	keyValuePairs,
} = require('../dist/nodes/CaptainFileSearch/GenericFunctions');
const {
	verifySignature,
} = require('../dist/nodes/CaptainFileSearchTrigger/CaptainFileSearchTrigger.node');
const { CaptainFileSearch } = require('../dist/nodes/CaptainFileSearch/CaptainFileSearch.node');

test('objectUri builds the URI each storage endpoint expects', () => {
	assert.equal(objectUri('s3', 'docs', undefined, 'reports/q3.pdf'), 's3://docs/reports/q3.pdf');
	assert.equal(objectUri('s3', 'docs', undefined, '/reports/q3.pdf'), 's3://docs/reports/q3.pdf');
	assert.equal(objectUri('gcs', 'docs', undefined, 'a.pdf'), 'gs://docs/a.pdf');
	assert.equal(objectUri('r2', 'docs', undefined, 'a.pdf'), 'r2://docs/a.pdf');
	assert.equal(objectUri('backblaze', 'docs', undefined, 'a.pdf'), 's3://docs/a.pdf');
	assert.equal(objectUri('supabase', 'docs', undefined, 'a.pdf'), 's3://docs/a.pdf');
	assert.equal(
		objectUri('azure', 'container', 'acct', 'a.pdf'),
		'https://acct.blob.core.windows.net/container/a.pdf',
	);
	// A full URI typed by the user is passed through untouched.
	assert.equal(objectUri('s3', 'docs', undefined, 's3://other/x.pdf'), 's3://other/x.pdf');
});

test('buildMultipart encodes fields and files', () => {
	const { body, contentType } = buildMultipart(
		{ processing_type: 'basic', skip_existing: false, empty: '', custom_metadata: '{"a":1}' },
		[
			{
				field: 'files',
				filename: 'r"1.pdf',
				contentType: 'application/pdf',
				data: Buffer.from('%PDF-1'),
			},
		],
	);
	const boundary = contentType.split('boundary=')[1];
	const text = body.toString('utf8');
	assert.ok(contentType.startsWith('multipart/form-data; boundary='));
	assert.match(text, /name="processing_type"\r\n\r\nbasic\r\n/);
	assert.match(text, /name="skip_existing"\r\n\r\nfalse\r\n/);
	assert.doesNotMatch(text, /name="empty"/);
	assert.match(
		text,
		/name="files"; filename="r\\"1.pdf"\r\nContent-Type: application\/pdf\r\n\r\n%PDF-1\r\n/,
	);
	assert.ok(text.endsWith(`--${boundary}--\r\n`));
});

test('dropEmpty and keyValuePairs drop blanks', () => {
	assert.deepEqual(dropEmpty({ a: 1, b: '', c: undefined, d: [], e: false }), { a: 1, e: false });
	assert.deepEqual(
		keyValuePairs({
			values: [
				{ key: 'dept', value: 'legal' },
				{ key: ' ', value: 'x' },
			],
		}),
		{
			dept: 'legal',
		},
	);
	assert.equal(keyValuePairs({}), undefined);
});

test('verifySignature accepts a Standard Webhooks signature and rejects tampering', () => {
	const key = Buffer.from('n8n-test-secret-n8n-test-secret!');
	const secret = `whsec_${key.toString('base64')}`;
	const body = '{"type":"job.completed"}';
	const now = 1_800_000_000;
	const sign = (id, ts, b) => createHmac('sha256', key).update(`${id}.${ts}.${b}`).digest('base64');
	const headers = {
		'svix-id': 'msg_1',
		'svix-timestamp': String(now),
		'svix-signature': `v1,${sign('msg_1', now, body)}`,
	};

	assert.equal(verifySignature(secret, headers, body, now), true);
	assert.equal(
		verifySignature(
			secret,
			{
				'webhook-id': 'msg_1',
				'webhook-timestamp': String(now),
				'webhook-signature': `v0,x v1,${sign('msg_1', now, body)}`,
			},
			body,
			now,
		),
		true,
	);
	assert.equal(verifySignature(secret, headers, body.replace('completed', 'failed'), now), false);
	assert.equal(verifySignature(secret, headers, body, now + 10 * 60), false);
	assert.equal(verifySignature('', headers, body, now), false);
	assert.equal(
		verifySignature(secret, { ...headers, 'svix-signature': 'v1,AAAA' }, body, now),
		false,
	);
});

test('every operation value is unique across resources, so credential display rules stay unambiguous', () => {
	const { properties } = new CaptainFileSearch().description;
	const values = properties
		.filter((p) => p.name === 'operation')
		.flatMap((p) => p.options.map((o) => o.value));
	const shared = ['delete', 'get', 'getMany'];
	const sourceOps = values.filter((v) => !shared.includes(v));
	assert.equal(new Set(sourceOps).size, sourceOps.length);
});

test('globList keeps commas inside braces', () => {
	assert.deepEqual(globList('*.{pdf,docx}, contracts/**, '), ['*.{pdf,docx}', 'contracts/**']);
	assert.deepEqual(globList(''), []);
});

test('Simplify keeps context the user asked for', () => {
	const { simplifyResult } = require('../dist/nodes/CaptainFileSearch/actions');
	const out = simplifyResult({
		text: 't',
		score: 1,
		document: { id: 'd' },
		neighboring_chunks: [{ text: 'n' }],
	});
	assert.deepEqual(out.neighboring_chunks, [{ text: 'n' }]);
	assert.equal(out.regions, undefined);
});

test('every operation names its object, not just a verb', () => {
	const { properties } = new CaptainFileSearch().description;
	const bare = properties
		.filter((p) => p.name === 'operation')
		.flatMap((p) => p.options)
		.filter(
			(o) =>
				o.name.trim().split(/\s+/).length < 2 ||
				/^(Get|Delete|Update|Create|Copy|Cancel|Get Many|Delete All|Run Now)$/.test(o.name),
		);
	assert.deepEqual(
		bare.map((o) => o.name),
		[],
	);
});

test('placeholders that show example values start with e.g.', () => {
	const { properties } = new CaptainFileSearch().description;
	const walk = (props) =>
		props.flatMap((p) => [
			p,
			...walk(p.options?.filter((o) => o.displayName) ?? []),
			...walk(p.values ?? []),
			...(p.options?.flatMap((o) => walk(o.values ?? [])) ?? []),
		]);
	const bad = walk(properties)
		.filter((p) => typeof p.placeholder === 'string' && !/^(e\.g\. |Add )/.test(p.placeholder))
		.map((p) => `${p.displayName}: ${p.placeholder}`);
	assert.deepEqual(bad, []);
});

test('simplifyJob reads both the job detail and the job list shapes', () => {
	const { simplifyJob } = require('../dist/nodes/CaptainFileSearch/actions');
	const fromList = simplifyJob({
		job_id: 'j1',
		status: 'failed',
		files_total: 3,
		files_indexed: 2,
		files_failed: 1,
		error: 'one file was unreadable',
		finished_at: '2026-10-28T18:00:00Z',
	});
	assert.deepEqual(
		[
			fromList.files_total,
			fromList.files_indexed,
			fromList.files_failed,
			fromList.error,
			fromList.finished_at,
		],
		[3, 2, 1, 'one file was unreadable', '2026-10-28T18:00:00Z'],
	);
	const fromDetail = simplifyJob({
		job_id: 'j2',
		status: 'completed',
		progress: { files_total: 4 },
		result: { files_indexed: 4, files_failed: 0 },
		completed_at: '2026-10-28T19:00:00Z',
	});
	assert.deepEqual(
		[
			fromDetail.files_total,
			fromDetail.files_indexed,
			fromDetail.files_failed,
			fromDetail.finished_at,
		],
		[4, 4, 0, '2026-10-28T19:00:00Z'],
	);
});

/** A minimal n8n execution context: parameters from a map, HTTP calls answered by a handler. */
function fakeContext(params, handle) {
	const calls = [];
	return {
		calls,
		getNode: () => ({
			name: 'Captain File Search',
			type: 'n8n-nodes-filesearch.captainFileSearch',
			typeVersion: 1,
			parameters: {},
		}),
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ apiKey: 'test', baseUrl: 'https://api.example.test' }),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (_cred, options) => {
				calls.push(`${options.method} ${options.url}`);
				return handle(options);
			},
			httpRequest: async (options) => {
				calls.push(`${options.method} ${options.url}`);
				return handle(options);
			},
		},
	};
}

test('parse results over 1 MB are fetched from result_url and split into chunks', async () => {
	const { runOperation } = require('../dist/nodes/CaptainFileSearch/actions');
	const ctx = fakeContext(
		{
			parseType: 'documents',
			inputType: 'url',
			fileUrl: 'https://example.com/big.pdf',
			processingType: 'basic',
			options: {},
			waitForCompletion: true,
			waitTimeout: 60,
			output: 'split',
		},
		(options) => {
			if (options.method === 'POST') return { job_id: 'prs_1', status: 'queued' };
			if (options.url.endsWith('/v3/parse/jobs/prs_1'))
				return {
					job_id: 'prs_1',
					status: 'completed',
					chunks: null,
					result_url: 'https://results.example.test/prs_1.json',
				};
			if (options.url === 'https://results.example.test/prs_1.json')
				return { chunks: [{ text: 'first' }, { text: 'second' }] };
			throw new Error(`unexpected request ${options.method} ${options.url}`);
		},
	);
	const items = await runOperation.call(ctx, 'parse', 'parse', 0);
	assert.deepEqual(
		items.map((item) => item.json),
		[
			{ job_id: 'prs_1', text: 'first' },
			{ job_id: 'prs_1', text: 'second' },
		],
	);
	assert.ok(ctx.calls.includes('GET https://results.example.test/prs_1.json'));
});

test('parse results that fit inline are not downloaded again', async () => {
	const { runOperation } = require('../dist/nodes/CaptainFileSearch/actions');
	const ctx = fakeContext(
		{
			parseType: 'documents',
			inputType: 'url',
			fileUrl: 'https://example.com/s.pdf',
			processingType: 'basic',
			options: {},
			waitForCompletion: true,
			waitTimeout: 60,
			output: 'split',
		},
		(options) => {
			if (options.method === 'POST') return { job_id: 'prs_2', status: 'queued' };
			return {
				job_id: 'prs_2',
				status: 'completed',
				chunks: [{ text: 'only' }],
				result_url: 'https://results.example.test/prs_2.json',
			};
		},
	);
	const items = await runOperation.call(ctx, 'parse', 'parse', 0);
	assert.equal(items.length, 1);
	assert.ok(!ctx.calls.some((c) => c.includes('results.example.test')));
});

test('Search Collection fills the Collection field when it is selected', async () => {
	const { runOperation } = require('../dist/nodes/CaptainFileSearch/actions');
	const ctx = fakeContext(
		{
			query: 'q',
			maxResults: 1,
			output: 'selected',
			fields: ['collection', 'text'],
			options: {},
			collection: 'contracts',
		},
		() => ({ results: [{ chunk_id: 'c1', text: 't', score: 1, document: { id: 'd1' } }] }),
	);
	const [item] = await runOperation.call(ctx, 'search', 'query', 0);
	assert.deepEqual(item.json, {
		collection: 'contracts',
		text: 't',
		chunk_id: 'c1',
		document_id: 'd1',
	});
});

test('JSON fields show their example as a visible hint, because n8n JSON editors hide placeholders', () => {
	const { properties } = new CaptainFileSearch().description;
	const jsonFields = properties
		.flatMap((p) => [p, ...(p.options ?? [])])
		.filter((p) => p.type === 'json');
	assert.ok(jsonFields.length >= 2);
	for (const field of jsonFields) assert.match(field.hint ?? '', /^e\.g\. /, field.displayName);
});

test('simplifyJob never reports processed files as indexed', () => {
	const { simplifyJob } = require('../dist/nodes/CaptainFileSearch/actions');
	const cancelled = simplifyJob({
		job_id: 'j3',
		status: 'cancelled',
		progress: { files_total: 4, files_processed: 4, files_failed: 1, files_skipped: 1 },
	});
	assert.equal(cancelled.files_indexed, undefined);
	assert.equal(cancelled.files_failed, 1);
});
