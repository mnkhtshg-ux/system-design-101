import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { marked } from 'marked'

interface Category {
  id: string
  title: string
  description: string
  image: string
  icon: string
  sort: number
}

interface Guide {
  id: string
  title: string
  description: string
  image: string
  createdAt: string
  draft: boolean
  categories: string[]
  tags: string[]
  body: string
}

const ROOT = process.cwd()
const CATEGORIES_DIR = path.join(ROOT, 'data/categories')
const GUIDES_DIR = path.join(ROOT, 'data/guides')
const SITE_DIR = path.join(ROOT, 'site')
const ASSETS_DIR = path.join(SITE_DIR, 'assets')
const GUIDES_OUT_DIR = path.join(SITE_DIR, 'guides')
const STYLES_SRC = path.join(ROOT, 'site-src/styles.css')
const APP_SRC = path.join(ROOT, 'site-src/app.js')

function htmlEscape(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function attrEscape(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getCategories(): Category[] {
  const files = fs.readdirSync(CATEGORIES_DIR).filter(f => f.endsWith('.md'))
  return files
    .map(file => {
      const content = fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8')
      const { data } = matter(content)
      return {
        id: file.replace(/\.md$/, ''),
        title: data.title ?? '',
        description: data.description ?? '',
        image: data.image ?? '',
        icon: data.icon ?? '',
        sort: typeof data.sort === 'number' ? data.sort : Number(data.sort) || 0
      }
    })
    .sort((a, b) => a.sort - b.sort)
}

function getGuides(): Guide[] {
  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'))
  return files
    .map(file => {
      const content = fs.readFileSync(path.join(GUIDES_DIR, file), 'utf8')
      const { data, content: body } = matter(content)
      return {
        id: file.replace(/\.md$/, ''),
        title: data.title ?? '',
        description: data.description ?? '',
        image: data.image ?? '',
        createdAt: data.createdAt ?? '',
        draft: Boolean(data.draft),
        categories: Array.isArray(data.categories) ? data.categories : [],
        tags: Array.isArray(data.tags) ? data.tags : [],
        body
      }
    })
    // Newest-first by createdAt
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function renderCard(guide: Guide, categoryTitleById: Map<string, string>): string {
  const catIds = guide.categories.join(' ')
  const tags = guide.tags.join(' ')
  const catTitles = guide.categories
    .map(id => categoryTitleById.get(id) ?? id)
    .join(' · ')
  return `      <a class="card" href="guides/${attrEscape(guide.id)}.html" data-title="${attrEscape(guide.title)}" data-description="${attrEscape(guide.description)}" data-categories="${attrEscape(catIds)}" data-tags="${attrEscape(tags)}">
        <h3 class="card-title">${htmlEscape(guide.title)}</h3>
        <p class="card-desc">${htmlEscape(guide.description)}</p>
        <div class="card-cats">${htmlEscape(catTitles)}</div>
      </a>`
}

function renderIndex(
  guides: Guide[],
  categories: Category[],
  categoryTitleById: Map<string, string>,
  countByCategory: Map<string, number>
): string {
  const chips = [
    `      <button class="chip active" data-category="">All</button>`,
    ...categories.map(cat => {
      const count = countByCategory.get(cat.id) ?? 0
      return `      <button class="chip" data-category="${attrEscape(cat.id)}">${htmlEscape(cat.title)} (${count})</button>`
    })
  ].join('\n')

  const cards = guides.map(g => renderCard(g, categoryTitleById)).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>System Design 101</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html">System Design 101</a>
    <input id="search" class="search" type="search" placeholder="Search guides…" autocomplete="off">
    <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">🌓</button>
  </header>
  <nav id="filters" class="filters">
${chips}
  </nav>
  <main>
    <p id="count" class="count"></p>
    <div id="results" class="results">
${cards}
    </div>
    <p id="empty" class="empty" hidden>No guides match your search.</p>
  </main>
  <script src="assets/app.js" defer></script>
</body>
</html>
`
}

function renderGuidePage(
  guide: Guide,
  categoryTitleById: Map<string, string>
): string {
  const bodyHtml = marked.parse(guide.body) as string
  const metaChips = guide.categories
    .map(id => {
      const title = categoryTitleById.get(id) ?? id
      return `      <a class="chip" href="../index.html">${htmlEscape(title)}</a>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(guide.title)} · System Design 101</title>
  <link rel="stylesheet" href="../assets/styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="../index.html">← System Design 101</a>
    <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">🌓</button>
  </header>
  <main class="guide">
    <h1>${htmlEscape(guide.title)}</h1>
    <div class="guide-meta">
${metaChips}
      <span class="date">${htmlEscape(guide.createdAt)}</span>
    </div>
    <img class="guide-hero" src="${attrEscape(guide.image)}" alt="${attrEscape(guide.title)}" loading="lazy">
    <article class="guide-body">${bodyHtml}</article>
  </main>
  <script src="../assets/app.js" defer></script>
</body>
</html>
`
}

function buildSearchIndex(
  guides: Guide[],
  categoryTitleById: Map<string, string>
): Array<Record<string, unknown>> {
  return guides.map(g => ({
    id: g.id,
    title: g.title,
    description: g.description,
    url: `guides/${g.id}.html`,
    categories: g.categories,
    categoryTitles: g.categories.map(id => categoryTitleById.get(id) ?? id),
    tags: g.tags,
    date: g.createdAt
  }))
}

function build() {
  if (!fs.existsSync(STYLES_SRC)) {
    throw new Error(`Missing required source file: ${STYLES_SRC}`)
  }
  if (!fs.existsSync(APP_SRC)) {
    throw new Error(`Missing required source file: ${APP_SRC}`)
  }

  const categories = getCategories()
  const guides = getGuides()

  const categoryTitleById = new Map<string, string>(
    categories.map(c => [c.id, c.title])
  )

  const countByCategory = new Map<string, number>()
  for (const cat of categories) countByCategory.set(cat.id, 0)
  for (const guide of guides) {
    for (const catId of guide.categories) {
      if (countByCategory.has(catId)) {
        countByCategory.set(catId, (countByCategory.get(catId) ?? 0) + 1)
      }
    }
  }

  // Recreate site/ cleanly
  fs.rmSync(SITE_DIR, { recursive: true, force: true })
  fs.mkdirSync(SITE_DIR, { recursive: true })
  fs.mkdirSync(ASSETS_DIR, { recursive: true })
  fs.mkdirSync(GUIDES_OUT_DIR, { recursive: true })

  // Copy assets verbatim
  fs.copyFileSync(STYLES_SRC, path.join(ASSETS_DIR, 'styles.css'))
  fs.copyFileSync(APP_SRC, path.join(ASSETS_DIR, 'app.js'))

  // index.html
  fs.writeFileSync(
    path.join(SITE_DIR, 'index.html'),
    renderIndex(guides, categories, categoryTitleById, countByCategory)
  )

  // guide pages
  for (const guide of guides) {
    fs.writeFileSync(
      path.join(GUIDES_OUT_DIR, `${guide.id}.html`),
      renderGuidePage(guide, categoryTitleById)
    )
  }

  // search-index.json
  fs.writeFileSync(
    path.join(SITE_DIR, 'search-index.json'),
    JSON.stringify(buildSearchIndex(guides, categoryTitleById), null, 2)
  )

  console.log(
    `Built site: ${guides.length} guide pages, ${categories.length} categories.`
  )
}

build()
