# Changelog

## 0.1.2

- Remove the `subcategories` field from both node codex files, as n8n's verification review requires.
- Correct the Replace option's description: it re-indexes every matching file already in the collection, not only changed ones.

## 0.1.1

- Pass n8n's community package scan for verification: operation actions are now in the sentence case n8n requires.
- Add the MIT LICENSE file.

## 0.1.0

First release.

- Captain File Search node: search, index from 14 sources, documents, collections, jobs, continuous syncs and parsing.
- Captain File Search Trigger node for job events, with signature checks.
- Credentials for the API and for each supported storage provider.
- Dropdowns for every location the node can list: buckets, containers, folders, files, manifests, Google Drive, SharePoint sites and libraries, OneDrive users, and Dropbox, plus region, audio language and caption language lists and a metadata filter builder.
