# PRD — Document sources: client-side import into the docs index

## Problem Statement

As an operator, the only way to ground the agent's L1 guidance in my product docs today is repo markdown (`docs.repoPaths`) or raw `POST /admin/docs` API calls. I can't simply **upload** a handbook/policy/FAQ, and I can't bring in the documents I already keep in **Google Drive, Dropbox, or SharePoint**. Getting knowledge into Helpuit is far harder than it should be, so the agent answers with less context than it could.

## Solution

A **Documents** area in the console where I can:

- **Drag-and-drop / upload** files from my machine, and
- **Import from Google Drive / Dropbox / OneDrive (SharePoint)** with one click — picking files through each provider's own native picker.

The document's text is ingested **immediately** (no restart) and starts grounding the agent's answers. PDFs, Word docs, Google Docs, and text/markdown are supported. I can see what I've imported (grouped by where it came from), **re-import** to refresh a doc, and **delete** one. Crucially, my documents go **straight from my browser into Helpuit** — no third-party service sits in the middle, and Helpuit never stores my Google/Dropbox/Microsoft credentials.

## User Stories

1. As an operator, I want to drag-and-drop a file onto a Documents page, so that its text grounds the agent's guidance without touching config or the repo.
2. As an operator, I want to upload a PDF, so that the agent can answer from a policy/handbook I have on disk.
3. As an operator, I want to upload a Word (DOCX) document, so that internal docs in Word are usable as knowledge.
4. As an operator, I want to upload plain text / markdown, so that simple notes are ingested with no conversion.
5. As an operator, I want to click "Import from Google Drive", pick a doc, and have it ingested, so that I don't have to download-then-upload.
6. As an operator, I want to import a **Google Doc** and have it come in as readable text, so that native Google formats just work.
7. As an operator, I want to click "Import from Dropbox" and pick files, so that Dropbox-hosted docs are one click away.
8. As an operator, I want to click "Import from OneDrive / SharePoint" and pick files, so that Microsoft-hosted docs are covered by a single connection.
9. As an operator, I want to select **multiple files** in one pick, so that I can seed the knowledge base quickly.
10. As an operator, I want each provider's own login/consent to happen in a popup against **my** account, so that I don't have to wait on an OAuth-app review or hand Helpuit broad access.
11. As an operator, I want the import to use credentials that **never leave my browser**, so that Helpuit holds no standing access to my cloud storage.
12. As an operator, I want a clear list of imported documents grouped by source (Upload / Drive / Dropbox / SharePoint), so that I know what the agent is grounded in.
13. As an operator, I want to **delete** an imported document, so that stale or wrong knowledge stops influencing answers.
14. As an operator, I want to **re-import** a document, so that I can refresh it after the source changed — without creating a duplicate.
15. As an operator, I want a freshly imported doc to be retrievable **immediately** (no restart), so that I can verify the agent picked it up.
16. As an operator with no provider apps configured, I want the **drag-and-drop** path to work with zero setup, so that I can use the feature on day one regardless of which cloud I use.
17. As an operator, I want a clear, non-blocking hint when a provider picker isn't enabled yet, so that I know what to configure without being stopped.
18. As an operator, I want a document that fails to extract (e.g. an unreadable file) to be skipped with a clear message, so that one bad file doesn't break the batch.
19. As a customer-facing outcome, I want the agent to cite/use my imported docs in its L1 answers, so that replies reflect our actual product documentation.
20. As an operator, I want GitHub-repo docs (`docs.repoPaths`) to keep working unchanged, so that existing grounding isn't disrupted.
21. As an operator concerned with privacy, I want documents to flow only from my browser to my self-hosted Helpuit, so that nothing is proxied through an external SaaS.
22. As an operator, I want imported docs to persist across restarts, so that I don't have to re-import after every deploy.
23. As an operator, I want to know which document a given grounded answer came from, so that I can trust and audit the source.

## Implementation Decisions

- **The browser is the universal adapter.** Drag-drop, provider pickers, and uploads all converge on the **existing** ingest endpoint. The backend stays a stateless, admin-authed text sink — **no** server-side OAuth, **no** stored provider tokens, **no** per-provider server adapters, **no** server-side file parsing, **no** file-browse API.
- **Reuse the existing ingest path.** `DocsService.add({title,text})` already persists a doc and ingests it into the shared in-memory docs index live (no restart). This is extended, not replaced.
- **Docs store gains a source identity.** The persisted docs gain `source` (`upload | gdrive | dropbox | sharepoint | repo`) and `externalId` (provider file id, or filename for uploads). A new `upsertBySource(source, externalId, {title,text})` makes re-import an insert-or-replace, so refreshing a document never duplicates it.
- **Docs index gains in-place update.** `InMemoryDocsIndex` gains `upsert(doc)` and `removeById(id)` so a live re-import replaces a document rather than appending a stale copy.
- **DocsService gains `importDoc({source, externalId, title, text})`** — orchestrates the store upsert + index upsert; the single seam the ingest route calls.
- **API contract (additive, back-compatible).** `POST /admin/docs` accepts optional `source` and `externalId` (defaulting `source: 'upload'`); existing callers that send only `{title,text}` are unchanged. `GET /admin/docs` returns `source`/`externalId`; `DELETE /admin/docs/:id` is unchanged. *(This is the entire backend surface change.)*
- **Provider pickers run client-side.** Dropbox Chooser (needs an app key), Google Picker (needs an API key + OAuth client id; end-user consents in a popup), and the Microsoft OneDrive/SharePoint File Picker (one Microsoft app id — covers SharePoint *and* OneDrive). The picker returns the file (or a short-lived, browser-only token + file id) to the client.
- **Text extraction is client-side.** A pure **extraction-dispatch** maps a file's mime type to an extractor: `pdfjs-dist` for PDF, `mammoth` for DOCX, passthrough for text/markdown; Google Docs are requested as text via the picker/Drive export. The client posts `{title, text, source, externalId}` to the ingest endpoint. The only new dependencies are **frontend** (`pdfjs-dist`, `mammoth`).
- **Provider app keys are operator config.** Non-secret app ids/keys are exposed to the client (so the UI knows which pickers are enabled); no provider client-secrets are required for the pickers. If a picker's app key is absent, its button shows a one-line "enable in Secrets" hint and the drag-drop path still works.
- **GitHub docs are unchanged** — already handled by `docs.repoPaths` + the repo docs loader; out of scope to rebuild.
- **One-time import.** Importing fetches + ingests the selected files now; **Re-import** refreshes (via upsert). No background sync.

## Testing Decisions

A good test exercises **external behavior through a module's public interface with real collaborators** — a real in-memory SQLite database and a real HTTP server (`buildServer`), never mocks of internal collaborators — so it survives refactors. This matches the codebase's existing style (e.g. the admin-docs route test that posts a doc, retrieves it from the live index in a grounded answer, then deletes it; the Drizzle repository tests; the `buildServer`-based admin route tests).

Modules to be tested (all four, TDD):

1. **Docs store — `upsertBySource`** (real `:memory:` DB): a first import inserts; re-importing the same `(source, externalId)` **replaces** rather than duplicating; `list()` returns `source`/`externalId`.
2. **Docs index — `upsert` / `removeById`** (real index): `upsert` replaces a document by id (retrieval reflects the new text, no stale copy); `removeById` drops it from retrieval.
3. **`DocsService.importDoc` round-trip** (real DB + index): importing a doc makes it both persisted in the store **and** immediately retrievable from the live index, with no restart.
4. **`POST /admin/docs` with `source`** (`buildServer`, real DB): the route accepts `source`/`externalId`, defaults to `upload` when omitted (back-compat), and the ingested doc is retrievable so it grounds an answer.

The client extraction-dispatch (mime → extractor) is a pure function and may carry a small unit test; the Documents tab UI and the live provider-picker popups are integration concerns, not unit-tested.

## Out of Scope

- Server-side OAuth, server-stored provider tokens, per-provider server REST adapters, and managed unified file APIs (Apideck/Merge/Nango) — explicitly avoided in favor of the browser-as-adapter approach.
- Background **auto-sync** / provider webhooks — this is one-time import with manual re-import.
- **OCR** for scanned/image PDFs.
- Formats beyond PDF / DOCX / text / markdown / Google Docs (e.g. PPTX, XLSX, HTML) — a heavier extraction layer is deferred.
- **Embeddings**-based retrieval — the existing token-overlap retrieval stays.
- **GitHub** document ingestion — already handled by `docs.repoPaths`.
- A server-side extraction fallback for very large files — can be added later if browser extraction proves insufficient.

## Further Notes

- The **drag-and-drop tier needs zero operator setup** and works for every provider (download → drop). The provider pickers are a slick, optional enhancement requiring only a **light app registration** per provider (far lighter than full server OAuth with sensitive-scope verification), with **no server-stored tokens** — smaller attack surface and better privacy, consistent with Helpuit's self-hosted stance.
- Picker SDKs load the providers' own client scripts (Google `gsi`/picker, Dropbox `dropins.js`, Microsoft picker), gated behind their buttons.
- The live provider-picker popups can't be exercised in an automated sandbox (same constraint as the existing GitHub App / Supabase OAuth flows); the extract → post → ingest path is fully covered via the upload tier.
- This supersedes the earlier "server-side OAuth + per-provider adapter" sketch; the reframe cuts that complexity entirely while improving the connect UX.
