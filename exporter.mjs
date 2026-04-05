import { Client } from '@notionhq/client'
import { config } from 'dotenv'
import fs from 'fs/promises'
import path from 'path'

config()

const notion = new Client({ auth: process.env.NOTION_TOKEN })
const OUTPUT_DIR = process.env.OUTPUT_DIR || './exports'
const SOURCE_HUB_ID = process.env.SOURCE_HUB_PAGE_ID

// ═══════════════════════════════════════════
// NOTION BLOCK → MARKDOWN CONVERTER
// ═══════════════════════════════════════════

function richTextToMarkdown(richTextArray) {
  if (!richTextArray || richTextArray.length === 0) return ''
  return richTextArray.map(rt => {
    let text = rt.plain_text || ''
    if (rt.annotations?.bold) text = `**${text}**`
    if (rt.annotations?.italic) text = `*${text}*`
    if (rt.annotations?.strikethrough) text = `~~${text}~~`
    if (rt.annotations?.code) text = `\`${text}\``
    if (rt.href) text = `[${text}](${rt.href})`
    return text
  }).join('')
}

function blockToMarkdown(block, depth = 0) {
  const indent = '  '.repeat(depth)
  const type = block.type

  switch (type) {
    case 'paragraph':
      return `${indent}${richTextToMarkdown(block.paragraph?.rich_text)}\n`
    case 'heading_1':
      return `# ${richTextToMarkdown(block.heading_1?.rich_text)}\n`
    case 'heading_2':
      return `## ${richTextToMarkdown(block.heading_2?.rich_text)}\n`
    case 'heading_3':
      return `### ${richTextToMarkdown(block.heading_3?.rich_text)}\n`
    case 'bulleted_list_item':
      return `${indent}- ${richTextToMarkdown(block.bulleted_list_item?.rich_text)}\n`
    case 'numbered_list_item':
      return `${indent}1. ${richTextToMarkdown(block.numbered_list_item?.rich_text)}\n`
    case 'to_do': {
      const checked = block.to_do?.checked ? 'x' : ' '
      return `${indent}- [${checked}] ${richTextToMarkdown(block.to_do?.rich_text)}\n`
    }
    case 'toggle':
      return `${indent}<details>\n${indent}<summary>${richTextToMarkdown(block.toggle?.rich_text)}</summary>\n`
    case 'code': {
      const lang = block.code?.language || ''
      const code = richTextToMarkdown(block.code?.rich_text)
      return `\`\`\`${lang}\n${code}\n\`\`\`\n`
    }
    case 'quote':
      return `> ${richTextToMarkdown(block.quote?.rich_text)}\n`
    case 'divider':
      return '---\n'
    case 'callout': {
      const icon = block.callout?.icon?.emoji || '💡'
      return `> ${icon} ${richTextToMarkdown(block.callout?.rich_text)}\n`
    }
    case 'table_of_contents':
      return '[TOC]\n'
    case 'image': {
      const url = block.image?.file?.url || block.image?.external?.url || ''
      const caption = richTextToMarkdown(block.image?.caption)
      return `![${caption}](${url})\n`
    }
    case 'bookmark':
      return `[${block.bookmark?.url}](${block.bookmark?.url})\n`
    case 'child_page':
      return `📄 **${block.child_page?.title}**\n`
    case 'child_database':
      return `🗃️ **${block.child_database?.title}**\n`
    default:
      return `<!-- unsupported block type: ${type} -->\n`
  }
}

// ═══════════════════════════════════════════
// PAGE FETCHER
// ═══════════════════════════════════════════

async function getPageTitle(pageId) {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId })
    const titleProp = Object.values(page.properties).find(p => p.type === 'title')
    if (titleProp?.title?.length > 0) {
      return titleProp.title.map(t => t.plain_text).join('')
    }
    return 'Untitled'
  } catch (err) {
    console.error(`Failed to get title for ${pageId}:`, err.message)
    return 'Untitled'
  }
}

async function getPageBlocks(pageId) {
  const blocks = []
  let cursor

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    })
    blocks.push(...response.results)
    cursor = response.has_more ? response.next_cursor : undefined
  } while (cursor)

  return blocks
}

async function pageToMarkdown(pageId) {
  const title = await getPageTitle(pageId)
  const blocks = await getPageBlocks(pageId)

  let md = `# ${title}\n\n`

  for (const block of blocks) {
    md += blockToMarkdown(block)

    // Recursively get children
    if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
      const children = await getPageBlocks(block.id)
      for (const child of children) {
        md += blockToMarkdown(child, 1)
      }
    }
  }

  return { title, markdown: md }
}

// ═══════════════════════════════════════════
// SOURCE HUB PARSER
// ═══════════════════════════════════════════

async function getSourceHubLinks() {
  if (!SOURCE_HUB_ID) {
    console.error('SOURCE_HUB_PAGE_ID not set in .env')
    process.exit(1)
  }

  const blocks = await getPageBlocks(SOURCE_HUB_ID)
  const links = []
  let currentSection = 'general'

  for (const block of blocks) {
    // Track sections via headings
    if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
      const headingText = richTextToMarkdown(block[block.type]?.rich_text)
      currentSection = headingText.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().toLowerCase().replace(/\s+/g, '-')
    }

    // Checked to-do items with Notion links = export targets
    if (block.type === 'to_do' && block.to_do?.checked) {
      const richText = block.to_do?.rich_text || []
      for (const rt of richText) {
        if (rt.href && rt.href.includes('notion.so')) {
          const pageId = extractPageId(rt.href)
          if (pageId) {
            links.push({ pageId, section: currentSection, title: rt.plain_text })
          }
        }
      }
    }

    // Also check bulleted/numbered list items with links
    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      const richText = block[block.type]?.rich_text || []
      for (const rt of richText) {
        if (rt.href && rt.href.includes('notion.so')) {
          const pageId = extractPageId(rt.href)
          if (pageId) {
            links.push({ pageId, section: currentSection, title: rt.plain_text })
          }
        }
      }
    }
  }

  return links
}

function extractPageId(url) {
  // Notion URLs: https://www.notion.so/Page-Title-<32-char-hex-id>
  const match = url.match(/([a-f0-9]{32})$/)
  if (match) return match[1]

  // Also try: https://www.notion.so/<workspace>/<id>
  const match2 = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/)
  if (match2) return match2[1].replace(/-/g, '')

  return null
}

// ═══════════════════════════════════════════
// EXPORT ENGINE
// ═══════════════════════════════════════════

async function exportPages(pageIds, outputDir) {
  await fs.mkdir(outputDir, { recursive: true })

  const results = []

  for (const { pageId, section, title } of pageIds) {
    try {
      console.log(`📄 Exporting: ${title || pageId}...`)
      const { title: pageTitle, markdown } = await pageToMarkdown(pageId)

      const safeName = pageTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().substring(0, 80)
      const sectionDir = path.join(outputDir, section)
      await fs.mkdir(sectionDir, { recursive: true })

      const filePath = path.join(sectionDir, `${safeName}.md`)
      await fs.writeFile(filePath, markdown, 'utf-8')

      results.push({ title: pageTitle, path: filePath, section })
      console.log(`  ✅ Saved: ${filePath}`)

      // Respect Notion API rate limit (~3 req/sec)
      await new Promise(r => setTimeout(r, 350))
    } catch (err) {
      console.error(`  ❌ Failed: ${title || pageId} — ${err.message}`)
      results.push({ title: title || pageId, error: err.message })
    }
  }

  return results
}

async function createCombinedFile(results, outputDir) {
  const sections = new Map()

  for (const r of results) {
    if (r.error) continue
    const section = r.section || 'general'
    if (!sections.has(section)) sections.set(section, [])

    const content = await fs.readFile(r.path, 'utf-8')
    sections.get(section).push({ title: r.title, content })
  }

  // Per-section combined files
  for (const [section, pages] of sections) {
    const combined = pages.map(p => `\n\n${'='.repeat(60)}\n# ${p.title}\n${'='.repeat(60)}\n\n${p.content}`).join('\n')
    const filePath = path.join(outputDir, section, '_ALL_SOURCES.md')
    await fs.writeFile(filePath, combined, 'utf-8')
    console.log(`📦 Combined file: ${filePath} (${pages.length} pages)`)
  }

  // Master combined file — upload this to NotebookLM
  const allPages = [...sections.values()].flat()
  const masterCombined = allPages.map(p => `\n\n${'='.repeat(60)}\n# ${p.title}\n${'='.repeat(60)}\n\n${p.content}`).join('\n')
  const masterPath = path.join(outputDir, '_MASTER_ALL_SOURCES.md')
  await fs.writeFile(masterPath, masterCombined, 'utf-8')
  console.log(`📦 Master combined: ${masterPath} (${allPages.length} total pages)`)
}

// ═══════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2)
  const listOnly = args.includes('--list')
  const exportAll = args.includes('--all')

  console.log('\n🚀 NEURUH Notion Auto-Exporter\n')

  if (SOURCE_HUB_ID) {
    console.log('📋 Reading Source Hub page...')
    const links = await getSourceHubLinks()
    console.log(`Found ${links.length} linked pages\n`)

    if (listOnly) {
      links.forEach((l, i) => console.log(`  ${i + 1}. [${l.section}] ${l.title}`))
      return
    }

    const results = await exportPages(links, OUTPUT_DIR)
    await createCombinedFile(results, OUTPUT_DIR)

    const success = results.filter(r => !r.error).length
    const failed = results.filter(r => r.error).length
    console.log(`\n✅ Done: ${success} exported, ${failed} failed`)
  } else if (args.length > 0 && !listOnly && !exportAll) {
    // Export specific page IDs passed as args
    const pageIds = args.map(id => ({ pageId: id, section: 'manual', title: id }))
    const results = await exportPages(pageIds, OUTPUT_DIR)
    await createCombinedFile(results, OUTPUT_DIR)
  } else {
    console.log('Usage:')
    console.log('  node exporter.mjs --list          # List Source Hub pages')
    console.log('  node exporter.mjs                  # Export checked Source Hub pages')
    console.log('  node exporter.mjs --all            # Export all Source Hub pages')
    console.log('  node exporter.mjs <page-id>        # Export specific page by ID')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
