import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

/**
 * Prints a content report for the guides under data/ to stdout.
 *
 * Run with: pnpm run report
 * Read-only — it never modifies any files. Useful for spotting content gaps
 * (categories with few guides) and tag-hygiene issues (case/plural variants
 * of the same tag) before doing a normalization pass.
 */

const CATEGORIES_DIR = path.join(process.cwd(), 'data/categories')
const GUIDES_DIR = path.join(process.cwd(), 'data/guides')

interface Guide {
  id: string
  createdAt: string
  categories: string[]
  tags: string[]
}

function loadCategoryTitles(): Map<string, string> {
  const titles = new Map<string, string>()
  fs.readdirSync(CATEGORIES_DIR)
    .filter(f => f.endsWith('.md'))
    .forEach(f => {
      const { data } = matter(fs.readFileSync(path.join(CATEGORIES_DIR, f), 'utf8'))
      titles.set(f.replace(/\.md$/, ''), data.title || f)
    })
  return titles
}

function loadGuides(): Guide[] {
  return fs
    .readdirSync(GUIDES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const { data } = matter(fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8'))
      return {
        id: f.replace(/\.md$/, ''),
        createdAt: data.createdAt,
        categories: data.categories || [],
        tags: data.tags || [],
      }
    })
}

function count<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>()
  items.forEach(item => {
    const k = key(item)
    map.set(k, (map.get(k) || 0) + 1)
  })
  return map
}

function main(): void {
  const categoryTitles = loadCategoryTitles()
  const guides = loadGuides()

  const out: string[] = []
  out.push('# Content Report\n')
  out.push(`- **Guides:** ${guides.length}`)
  out.push(`- **Categories:** ${categoryTitles.size}`)

  const dates = guides.map(g => g.createdAt).filter(Boolean).sort()
  if (dates.length) {
    out.push(`- **Date range:** ${dates[0]} → ${dates[dates.length - 1]}`)
  }

  // Guides per category
  out.push('\n## Guides per category\n')
  const perCategory = count(
    guides.flatMap(g => g.categories.map(c => ({ c }))),
    item => item.c
  )
  ;[...categoryTitles.keys()]
    .map(id => ({ id, n: perCategory.get(id) || 0 }))
    .sort((a, b) => b.n - a.n)
    .forEach(({ id, n }) => {
      const flag = n === 0 ? '  ⚠️ no guides' : ''
      out.push(`- ${categoryTitles.get(id)} (\`${id}\`): **${n}**${flag}`)
    })

  // Tag overview
  const tagCounts = count(
    guides.flatMap(g => g.tags.map(t => ({ t }))),
    item => item.t
  )
  out.push(`\n## Tags\n`)
  out.push(`- **Distinct tags:** ${tagCounts.size}`)
  out.push(`- **Total tag usages:** ${guides.reduce((s, g) => s + g.tags.length, 0)}`)

  out.push('\n### Top 20 tags\n')
  ;[...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([tag, n]) => out.push(`- ${tag}: ${n}`))

  // Normalization candidates: tags that collapse to the same key once
  // lowercased and de-pluralized (trailing "s" removed).
  const normKey = (tag: string) => tag.toLowerCase().replace(/s$/, '')
  const clusters = new Map<string, Map<string, number>>()
  tagCounts.forEach((n, tag) => {
    const k = normKey(tag)
    if (!clusters.has(k)) clusters.set(k, new Map())
    clusters.get(k)!.set(tag, n)
  })
  const dupeClusters = [...clusters.values()]
    .filter(forms => forms.size > 1)
    .sort((a, b) => b.size - a.size)

  out.push(`\n### Tag normalization candidates (${dupeClusters.length})\n`)
  out.push('Tags that differ only by case or pluralization — candidates for merging:\n')
  dupeClusters.forEach(forms => {
    const parts = [...forms.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, n]) => `\`${tag}\` (${n})`)
    out.push(`- ${parts.join(' = ')}`)
  })

  console.log(out.join('\n'))
}

main()
