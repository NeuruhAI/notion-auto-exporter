# Notion Auto-Exporter

**Built by [Neuruh](https://neuruh.com) — Open Source**

Reads a Notion Source Hub page, downloads linked pages as markdown, organizes output by build folder, and assembles combined `_ALL_SOURCES.md` files per section plus a `_MASTER_ALL_SOURCES.md` — ready for direct upload to NotebookLM or any RAG pipeline.

This tool was built inside the Neuruh operating system as part of the **Source Hub workflow** — a pattern for maintaining curated, AI-ready knowledge bases directly inside Notion, then exporting them on demand for NotebookLM training sessions, agent context injection, and prompt engineering pipelines.

---

## What It Does

```
Notion Source Hub Page
  ├── [x] Build: AXON Gateway          ← checked = export target
  ├── [x] Build: DISPATCH-IQ Spec
  ├── [ ] Build: Draft (skipped)
  └── [x] Context: PMLA Architecture

              ↓  node exporter.mjs

exports/
  ├── axon-gateway/
  │   ├── AXON Gateway Phase 1.md
  │   ├── AXON Dev Log.md
  │   └── _ALL_SOURCES.md             ← upload this to NotebookLM
  ├── dispatch-iq-spec/
  │   ├── DISPATCH-IQ Full Spec.md
  │   └── _ALL_SOURCES.md
  └── _MASTER_ALL_SOURCES.md          ← or this for everything at once
```

**The rule is simple:** check a box on your Source Hub page → it gets exported next run.

---

## Stack

- **Runtime:** Node.js (ESM)
- **Notion SDK:** `@notionhq/client`
- **Config:** `dotenv`
- **No build step.** No TypeScript compile. No framework. Runs directly.

---

## Source Hub Workflow

The Source Hub is a Notion page that acts as the export manifest for a build or project. Structure it like this:

```
## AXON Gateway

- [x] [AXON Phase 1 Spec](https://notion.so/...)
- [x] [AXON Dev Log](https://notion.so/...)
- [ ] [Scratch Notes](https://notion.so/...)    ← unchecked = skipped

## DISPATCH-IQ

- [x] [Full System Spec](https://notion.so/...)
- [x] [RTL-SDR Hardware Notes](https://notion.so/...)
```

The exporter reads headings as section names (used for folder organization), then collects every **checked** to-do or linked list item with a Notion URL. Unchecked items are ignored. Headings become the subfolder names inside `exports/`.

Once exported, each section folder contains individual `.md` files plus a `_ALL_SOURCES.md` that concatenates everything in that section — one file, ready to drop into NotebookLM as a single source document.

---

## Setup

### Prerequisites

- Node.js 18+ (check: `node --version`)
- A Notion account with at least one integration created

### 1. Clone the repo

```bash
git clone https://github.com/NeuruhAI/notion-auto-exporter.git
cd notion-auto-exporter
```

### 2. Install dependencies

```bash
npm install
```

This installs `@notionhq/client` and `dotenv`. Nothing else.

### 3. Create your Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Name it `Neuruh Exporter` (or anything you want)
4. Set capabilities: **Read content** + **Read user info**
5. Copy the token that starts with `ntn_`

### 4. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```bash
NOTION_TOKEN=ntn_your_actual_token_here
SOURCE_HUB_PAGE_ID=your_source_hub_page_id_here
OUTPUT_DIR=./exports
```

**Finding your Source Hub page ID:**
Open the page in Notion → look at the URL → copy the 32-character hex string at the end:
```
https://www.notion.so/Your-Page-Title-839c227d86d649c5ac48491ed0dd4348
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                       This is your page ID
```

### 5. Share pages with your integration

This step is required. The Notion API will silently return nothing for pages your integration can't access.

For each page you want to export (including the Source Hub itself):
1. Open the page in Notion
2. Click `···` (top right) → **Connections**
3. Add your integration by name

You only need to do this once per page. Child pages inherit access automatically.

---

## Usage

```bash
# See what the Source Hub would export (dry run)
npm run list

# Export all checked pages from Source Hub
npm run export

# Export a specific page by ID (no Source Hub required)
node exporter.mjs 839c227d86d649c5ac48491ed0dd4348
```

### Output structure

After running `npm run export`:

```
exports/
  ├── <section-name>/
  │   ├── Page Title One.md
  │   ├── Page Title Two.md
  │   └── _ALL_SOURCES.md        ← section combined file
  └── _MASTER_ALL_SOURCES.md     ← everything combined
```

Upload `_ALL_SOURCES.md` (per section) or `_MASTER_ALL_SOURCES.md` (everything) to [NotebookLM](https://notebooklm.google.com).

---

## NotebookLM Upload

1. Go to [notebooklm.google.com](https://notebooklm.google.com)
2. Create a new notebook (or open existing)
3. Click **+** → **Upload** → select your `_ALL_SOURCES.md` or `_MASTER_ALL_SOURCES.md`
4. NotebookLM processes the file and makes all pages searchable and citeable

NotebookLM handles the 200k token limit per source — if your combined file exceeds that, use the per-section files instead.

---

## Verification Checklist

Before your first export run, confirm:

- [ ] Notion integration token created and in `.env`
- [ ] Source Hub page shared with integration
- [ ] `npm run list` shows your expected pages
- [ ] `npm run export` creates `.md` files in `./exports/`
- [ ] `_ALL_SOURCES.md` files created per section
- [ ] `_MASTER_ALL_SOURCES.md` contains all pages
- [ ] Upload to NotebookLM succeeds

---

## Limitations

- **Images** are exported as markdown image links. NotebookLM ignores images — only text content is indexed.
- **Databases** are noted but not recursively exported. Export individual pages from within a database instead.
- **Rate limit** is handled automatically (350ms delay between requests). Large exports take proportionally longer.
- **Nested toggles** are fetched one level deep. Deeply nested content may be incomplete.

---

## Contributing

Pull requests welcome. Open an issue first for anything beyond bug fixes.

Built on the open-core Neuruh stack. More tools at [github.com/NeuruhAI](https://github.com/NeuruhAI).

---

## License

MIT License. Use it, fork it, ship it.
