# Notion Auto-Exporter

Reads a Notion "source hub" page, downloads every checked linked page as markdown, organises
the output by section, and writes a combined `_ALL_SOURCES.md` per section plus one
`_MASTER_ALL_SOURCES.md` — a shape most RAG pipelines and document-upload tools accept directly.

## What it does

The source hub is an ordinary Notion page used as an export manifest. Headings become section
names; checked to-do or linked-list items become export targets. Unchecked items are skipped.

```
Notion source hub page
  ## Handbook
  - [x] Onboarding Guide         <- exported
  - [x] Support Playbook         <- exported
  - [ ] Draft Notes              <- skipped
  ## Reference
  - [x] API Overview             <- exported

              node exporter.mjs

exports/
  handbook/
    Onboarding Guide.md
    Support Playbook.md
    _ALL_SOURCES.md
  reference/
    API Overview.md
    _ALL_SOURCES.md
  _MASTER_ALL_SOURCES.md
```

Check a box, and the page is included on the next run.

## Requirements

- Node.js 18 or newer
- A Notion integration token with read access to the pages you want to export

## Install

```bash
git clone https://github.com/NeuruhAI/notion-auto-exporter.git
cd notion-auto-exporter
npm install
```

This installs `@notionhq/client` and `dotenv`. There is no build step.

## Configure

Create the integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
with the **Read content** and **Read user info** capabilities, then copy the token.

```bash
cp .env.example .env
```

```bash
NOTION_TOKEN=ntn_your_token_here
SOURCE_HUB_PAGE_ID=your_source_hub_page_id_here
OUTPUT_DIR=./exports
```

The page ID is the 32-character hex string at the end of the page URL:

```
https://www.notion.so/Your-Page-Title-839c227d86d649c5ac48491ed0dd4348
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

Then share each page — including the source hub itself — with the integration:
open the page, `···` → **Connections** → add the integration. Child pages inherit access.
This step is not optional: the Notion API returns nothing, without an error, for pages an
integration cannot see.

## Sixty-second example

```bash
npm run list
```

Expected output — one line per page the source hub would export, and nothing is written:

```text
Notion Auto-Exporter

Reading Source Hub page...
Found 3 linked pages

  1. [handbook] Onboarding Guide
  2. [handbook] Support Playbook
  3. [reference] API Overview
```

Then run the export:

```bash
npm run export
```

```text
Exporting: Onboarding Guide...
  saved: exports/handbook/Onboarding Guide.md
...
Combined file: exports/handbook/_ALL_SOURCES.md (2 pages)
Combined file: exports/reference/_ALL_SOURCES.md (1 pages)
Master combined: exports/_MASTER_ALL_SOURCES.md (3 total pages)

Done: 3 exported, 0 failed
```

A single page can also be exported directly, with no source hub:

```bash
node exporter.mjs 839c227d86d649c5ac48491ed0dd4348
```

## API

The module exports its pure conversion functions, so they can be used or tested without a
Notion token:

| Export | Purpose |
| --- | --- |
| `richTextToMarkdown(richTextArray)` | Notion rich text to markdown, annotations and links applied. |
| `blockToMarkdown(block, depth = 0)` | One Notion block to a markdown line, indented by depth. |
| `extractPageId(url)` | The 32-character page ID from a Notion URL, or `null`. |
| `createCombinedFile(results, outputDir)` | Write the per-section and master combined files. |

Importing the module does not start the CLI.

## Test

```bash
npm test
```

## Limitations

- Images become markdown image links. Whether they are indexed is up to the consuming tool.
- Databases are noted but not recursively exported. Export pages from within a database instead.
- Requests are spaced 350 ms apart to stay inside Notion's rate limit, so large exports take
  proportionally longer.
- Nested toggles are fetched one level deep; more deeply nested content may be incomplete.
- Block types the converter does not handle are emitted as an HTML comment naming the type,
  rather than dropped silently.

## Safety boundary

The token in `.env` grants read access to every page shared with the integration, and every
exported page is written to the local filesystem in plain text. Share only the pages you intend
to export, keep `OUTPUT_DIR` out of version control (`.gitignore` already excludes `exports/`),
and treat a combined `_ALL_SOURCES.md` as containing everything the integration could read.

The tool only reads from Notion. It never writes to, edits, or deletes a Notion page.

## Contributing

Pull requests are welcome. Please open an issue first for anything beyond a bug fix.

## License

MIT. See [`LICENSE`](LICENSE).
