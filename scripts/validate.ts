import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

/**
 * Validates the integrity of the content under data/ and verifies that the
 * README table of contents is in sync with the generator.
 *
 * Run with: pnpm run validate
 * Exits with a non-zero status (and a list of problems) if anything is wrong,
 * so it can be used as a CI guard on pull requests.
 */

const CATEGORIES_DIR = path.join(process.cwd(), 'data/categories')
const GUIDES_DIR = path.join(process.cwd(), 'data/guides')
const README_PATH = path.join(process.cwd(), 'README.md')

interface Category {
  id: string
  title: string
  sort: number
}

interface Guide {
  id: string
  title: string
  createdAt: string
  categories: string[]
}

const errors: string[] = []

function getCategories(): Category[] {
  return fs
    .readdirSync(CATEGORIES_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const id = file.replace(/\.md$/, '')
      const { data } = matter(fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8'))
      if (!data.title) errors.push(`Category "${id}" is missing a "title".`)
      if (typeof data.sort !== 'number') errors.push(`Category "${id}" is missing a numeric "sort".`)
      return { id, title: data.title, sort: data.sort }
    })
}

function getGuides(categoryIds: Set<string>): Guide[] {
  const sortValues = new Map<number, string>()

  return fs
    .readdirSync(GUIDES_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const id = file.replace(/\.md$/, '')
      const { data } = matter(fs.readFileSync(path.join(GUIDES_DIR, file), 'utf8'))

      if (!data.title) errors.push(`Guide "${id}" is missing a "title".`)
      if (!data.description) errors.push(`Guide "${id}" is missing a "description".`)
      if (!data.image) errors.push(`Guide "${id}" is missing an "image".`)

      if (!data.createdAt) {
        errors.push(`Guide "${id}" is missing a "createdAt".`)
      } else if (isNaN(new Date(data.createdAt).getTime())) {
        errors.push(`Guide "${id}" has an invalid "createdAt": ${JSON.stringify(data.createdAt)}.`)
      }

      const categories: string[] = data.categories || []
      if (categories.length === 0) {
        errors.push(`Guide "${id}" has no "categories".`)
      }
      categories.forEach(cat => {
        if (!categoryIds.has(cat)) {
          errors.push(`Guide "${id}" references undefined category "${cat}".`)
        }
      })

      return { id, title: data.title, createdAt: data.createdAt, categories }
    })
}

function generateMarkdownList(categories: Category[], guides: Guide[]): string {
  let markdown = ''
  ;[...categories]
    .sort((a, b) => a.sort - b.sort)
    .forEach(category => {
      markdown += `* [${category.title}](https://bytebytego.com/guides/${category.id})\n`
      guides
        .filter(guide => guide.categories.includes(category.id))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach(guide => {
          markdown += `  * [${guide.title}](https://bytebytego.com/guides/${guide.id})\n`
        })
    })
  return markdown
}

function checkReadmeInSync(categories: Category[], guides: Guide[]): void {
  const readmeContent = fs.readFileSync(README_PATH, 'utf8')
  const match = readmeContent.match(/<!-- TOC -->\n([\s\S]*?)\n<!-- \/TOC -->/)
  if (!match) {
    errors.push('README.md is missing the <!-- TOC --> / <!-- /TOC --> markers.')
    return
  }
  const expected = `\n${generateMarkdownList(categories, guides)}\n`
  if (match[1] !== expected) {
    errors.push('README.md table of contents is out of date. Run "pnpm run update-readme".')
  }
}

function main(): void {
  const categories = getCategories()
  const categoryIds = new Set(categories.map(c => c.id))
  const guides = getGuides(categoryIds)

  // Warn (not fail) about categories that have no guides yet.
  const usedCategories = new Set(guides.flatMap(g => g.categories))
  categories
    .filter(c => !usedCategories.has(c.id))
    .forEach(c => console.warn(`⚠️  Category "${c.id}" has no guides.`))

  checkReadmeInSync(categories, guides)

  if (errors.length > 0) {
    console.error(`\n❌ Validation failed with ${errors.length} problem(s):\n`)
    errors.forEach(e => console.error(`  - ${e}`))
    process.exit(1)
  }

  console.log(`✅ Validation passed: ${categories.length} categories, ${guides.length} guides, README in sync.`)
}

main()
