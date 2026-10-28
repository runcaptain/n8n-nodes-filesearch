# n8n-nodes-filesearch

n8n nodes for the [Captain File Search API](https://docs.filesearch.dev). Index files from cloud storage, drives, URLs or earlier workflow steps, search them in plain language, read documents back, and start workflows when a job finishes.

The package has two nodes:

- **Captain File Search** runs actions on the API. It also works as a tool for the n8n AI Agent, so an agent can search your collections.
- **Captain File Search Trigger** starts a workflow when an indexing or parse job completes, fails, is cancelled or times out.

## Installation

In n8n, open **Settings → Community Nodes → Install** and enter `n8n-nodes-filesearch`. See the [n8n guide to community nodes](https://docs.n8n.io/integrations/community-nodes/installation/) for self-hosted setups.

## Credentials

Every action needs a **Captain File Search API** credential: an API key from the Captain console. Leave the base URL as `https://api.filesearch.dev` unless Captain gave you another endpoint.

Indexing from your own storage also needs a credential for that storage. The node sends these values to File Search with each request, and File Search uses them to read your files.

| Storage | Credential | What it holds |
| --- | --- | --- |
| Amazon S3 | Captain File Search: Amazon S3 | An access key, or an IAM role ARN and external ID that Captain assumes |
| Google Cloud Storage, Google Drive | Captain File Search: Google Service Account | The service account JSON key. For Drive, also the Workspace user to read as. |
| Azure Blob Storage | Captain File Search: Azure Blob Storage | Storage account name and key |
| Cloudflare R2 | Captain File Search: Cloudflare R2 | Account ID, access key, jurisdiction |
| Supabase Storage | Captain File Search: Supabase Storage | S3 endpoint URL, region, access key |
| Backblaze B2 | Captain File Search: Backblaze B2 | S3 endpoint URL, region, application key |
| SharePoint, OneDrive | Captain File Search: Microsoft 365 | Entra ID tenant ID, client ID and client secret |
| Dropbox | Captain File Search: Dropbox | An access token with `files.metadata.read` and `files.content.read` |

The Microsoft 365 and Dropbox credentials are checked against Microsoft and Dropbox when you save them. The storage credentials are checked for format only. File Search confirms bucket access when a job starts.

## Actions

Every action names what it works on, so the list reads as a set of tasks.

**Search**
- Search Collection: returns the passages that answer a question, one item per passage.
- Search Multiple Collections: one question across up to 10 collections.

**Output** decides how much each passage carries. Simplified (the default) returns the text, score, file, page, IDs and metadata. Raw returns every field. Selected Fields returns only the fields you pick, plus the chunk and document IDs. Use Simplified or Selected Fields when an AI agent calls the node, so its context stays small. Options cover metadata filters, reranking, the keyword and semantic balance, a cap on results per document, and extra context such as neighboring chunks.

**Index**
- Index Uploaded File: binary data from an earlier step, such as an email attachment.
- Index File From URL, Index Text, Index YouTube Video.
- Index Files From Amazon S3, Google Cloud Storage, Azure Blob Storage, Cloudflare R2, Supabase Storage or Backblaze B2: a whole bucket, a folder, a single file, or the files listed in a manifest.
- Index Files From Google Drive, SharePoint, OneDrive or Dropbox: everything, a folder, or a single file.

The files are processed by File Search, not by n8n. The node starts the job and, with **Wait for Completion** on (the default), polls the job until it finishes and returns the result. Turn waiting off to get the job ID right away. For large jobs, use the trigger node to continue the workflow when the job is done.

**If Already Indexed** decides what happens to files already in the collection: skip them, replace changed ones, or index them again. It applies to uploaded files and storage sources. Index Text and Index File From URL always add a new document.

**Document**: Get Many Documents, Get Document, Get Document Page, Get Document Chunks, Update Document Metadata, Delete Document, Delete All Documents.

**Collection**: Create Collection, Get Many Collections, Copy Collection, Delete Collection. Create Collection returns the existing collection when the name is taken, so a workflow can create its collection on every run.

**Job**: Get Job, Get Many Jobs, Wait for Job to Finish, Cancel Job.

**Sync**: keep a collection in step with an S3, Google Cloud Storage, Azure, R2, Supabase or Backblaze bucket. Create a sync, then Get Sync, Get Many Syncs, Update Sync (pause, resume, change patterns or schedule), Run Sync Now, or Delete Sync.

**Parse**: Parse File turns a document or spreadsheet into structured chunks without indexing it. The input is a binary file or a URL.

Collections, documents, jobs and syncs can be picked from searchable dropdowns that load from your account. The document list shows the files in the collection you picked. Every picker also takes an ID, so a workflow can pass one from an earlier step.

**Simplify** is on by default for jobs, documents and syncs and returns the 10 most useful fields. Turn it off for the full response. Delete actions return `{"deleted": true}`.

## Trigger

The trigger registers a webhook with File Search when you activate the workflow and removes it when you deactivate it. Choose the events, and optionally the collections and whether the job came from an API call or a sync. Every delivery is signature-checked. A request with a missing or wrong signature is rejected.

File Search only delivers to public HTTPS URLs, so the n8n instance must be reachable from the internet over HTTPS.

## Example: answer questions from new contracts

1. **Gmail Trigger** on new emails with attachments.
2. **Captain File Search → Index Uploaded File** into a `contracts` collection, with the sender as custom metadata.
3. **AI Agent** with **Captain File Search → Search Collection** as a tool, pointed at `contracts`.

## Development

```bash
npm install
npm run build
npm run lint
npm test
npm run dev   # starts n8n with this package loaded
```

## Compatibility

Built and tested with n8n 2.45. Requires `n8nNodesApiVersion` 1.
