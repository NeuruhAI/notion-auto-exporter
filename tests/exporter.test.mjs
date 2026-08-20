import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  blockToMarkdown,
  createCombinedFile,
  extractPageId,
  richTextToMarkdown,
} from '../exporter.mjs'

const rt = (text, extra = {}) => ({ plain_text: text, ...extra })

test('richTextToMarkdown returns an empty string for missing or empty input', () => {
  assert.equal(richTextToMarkdown(undefined), '')
  assert.equal(richTextToMarkdown([]), '')
})

test('richTextToMarkdown joins segments without a separator', () => {
  assert.equal(richTextToMarkdown([rt('one '), rt('two')]), 'one two')
})

test('richTextToMarkdown applies each annotation', () => {
  assert.equal(richTextToMarkdown([rt('b', { annotations: { bold: true } })]), '**b**')
  assert.equal(richTextToMarkdown([rt('i', { annotations: { italic: true } })]), '*i*')
  assert.equal(richTextToMarkdown([rt('s', { annotations: { strikethrough: true } })]), '~~s~~')
  assert.equal(richTextToMarkdown([rt('c', { annotations: { code: true } })]), '`c`')
})

test('richTextToMarkdown wraps a link around the annotated text', () => {
  assert.equal(
    richTextToMarkdown([rt('x', { annotations: { bold: true }, href: 'https://example.com' })]),
    '[**x**](https://example.com)',
  )
})

test('blockToMarkdown renders headings without indentation', () => {
  assert.equal(blockToMarkdown({ type: 'heading_1', heading_1: { rich_text: [rt('H')] } }, 3), '# H\n')
  assert.equal(blockToMarkdown({ type: 'heading_2', heading_2: { rich_text: [rt('H')] } }), '## H\n')
  assert.equal(blockToMarkdown({ type: 'heading_3', heading_3: { rich_text: [rt('H')] } }), '### H\n')
})

test('blockToMarkdown indents list items by depth', () => {
  const block = { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [rt('item')] } }
  assert.equal(blockToMarkdown(block, 0), '- item\n')
  assert.equal(blockToMarkdown(block, 2), '    - item\n')
})

test('blockToMarkdown reflects to_do checked state', () => {
  const todo = (checked) => ({ type: 'to_do', to_do: { checked, rich_text: [rt('t')] } })
  assert.equal(blockToMarkdown(todo(true)), '- [x] t\n')
  assert.equal(blockToMarkdown(todo(false)), '- [ ] t\n')
})

test('blockToMarkdown fences code with its language', () => {
  const block = { type: 'code', code: { language: 'python', rich_text: [rt('print(1)')] } }
  assert.equal(blockToMarkdown(block), '```python\nprint(1)\n```\n')
})

test('blockToMarkdown prefers an uploaded image URL over an external one', () => {
  const block = {
    type: 'image',
    image: { file: { url: 'file-url' }, external: { url: 'external-url' }, caption: [rt('cap')] },
  }
  assert.equal(blockToMarkdown(block), '![cap](file-url)\n')
})

test('blockToMarkdown falls back to an external image URL', () => {
  const block = { type: 'image', image: { external: { url: 'external-url' }, caption: [] } }
  assert.equal(blockToMarkdown(block), '![](external-url)\n')
})

test('blockToMarkdown comments out an unsupported block instead of dropping it', () => {
  assert.equal(blockToMarkdown({ type: 'synced_block' }), '<!-- unsupported block type: synced_block -->\n')
})

test('extractPageId reads a bare 32-character id from the end of a URL', () => {
  assert.equal(
    extractPageId('https://www.notion.so/Title-839c227d86d649c5ac48491ed0dd4348'),
    '839c227d86d649c5ac48491ed0dd4348',
  )
})

test('extractPageId strips dashes from a hyphenated id', () => {
  assert.equal(
    extractPageId('https://www.notion.so/team/839c227d-86d6-49c5-ac48-491ed0dd4348'),
    '839c227d86d649c5ac48491ed0dd4348',
  )
})

test('extractPageId returns null when there is no id', () => {
  assert.equal(extractPageId('https://www.notion.so/Just-A-Title'), null)
})

test('createCombinedFile writes one file per section plus a master file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'exporter-test-'))
  try {
    await mkdir(path.join(dir, 'alpha'), { recursive: true })
    await mkdir(path.join(dir, 'beta'), { recursive: true })
    const a = path.join(dir, 'alpha', 'One.md')
    const b = path.join(dir, 'beta', 'Two.md')
    await writeFile(a, 'body one', 'utf-8')
    await writeFile(b, 'body two', 'utf-8')

    await createCombinedFile(
      [
        { section: 'alpha', title: 'One', path: a },
        { section: 'beta', title: 'Two', path: b },
        { section: 'beta', title: 'Broken', error: 'nope' },
      ],
      dir,
    )

    const alpha = await readFile(path.join(dir, 'alpha', '_ALL_SOURCES.md'), 'utf-8')
    const master = await readFile(path.join(dir, '_MASTER_ALL_SOURCES.md'), 'utf-8')
    assert.match(alpha, /# One/)
    assert.match(alpha, /body one/)
    assert.doesNotMatch(alpha, /body two/)
    assert.match(master, /body one/)
    assert.match(master, /body two/)
    assert.doesNotMatch(master, /Broken/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('importing the module does not run the CLI', async () => {
  const mod = await import('../exporter.mjs')
  assert.equal(typeof mod.extractPageId, 'function')
})
