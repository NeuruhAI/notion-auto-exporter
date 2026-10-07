# Changelog

## 1.0.1

- The module now exports its pure conversion functions, and the CLI only runs when
  `exporter.mjs` is the entry point. Importing the module previously started an export.
- Added a test suite covering rich-text annotation and link handling, block conversion for
  every supported type, unsupported-block fallback, page-ID extraction from both Notion URL
  forms, and the combined-file writer. CI runs it on Node 18, 20, and 22.
- `package.json` declares the license, repository, homepage, issues, published files, and a
  Node engine floor, and adds a `test` script.
- README rewritten with neutral examples, expected command output, the exported API, and a
  section on what the integration token grants. It previously used internal project names as
  illustrations.
- Console output no longer uses decorative emoji. Markdown conversion is unchanged, so
  previously exported files still match.

## 1.0.0

- Source-hub-driven Notion to markdown exporter with per-section and master combined files.
