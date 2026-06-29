import fs from 'fs'
import path from 'path'

/**
 * Normalizes guide tags that differ ONLY by letter case (e.g. "system design"
 * -> "System Design") to the most-used surface form in each case-insensitive
 * cluster. This is the unambiguous half of tag hygiene:
 *
 *   - It never merges singular/plural variants ("Database" vs "Databases") —
 *     those are judgment calls left for a human.
 *   - Because clustering is case-insensitive only, acronyms that differ by a
 *     trailing letter (e.g. "HTTP" vs "HTTPS") stay separate and untouched.
 *
 * To minimise diff noise it edits guide files line-by-line: a tag line is only
 * rewritten when its value actually changes, and the line's existing quote
 * style is preserved. Duplicate tags created by the merge are dropped.
 *
 * Run with: pnpm run normalize-tags
 */

const GUIDES_DIR = path.join(process.cwd(), 'data/guides')

const TAG_ITEM = /^(\s*-\s*)(.*?)(\s*)$/

function unquote(value: string): { bare: string; quote: string } {
  const m = value.match(/^(['"])(.*)\1$/)
  if (m) return { bare: m[2], quote: m[1] }
  return { bare: value, quote: '' }
}

/** Collect every distinct tag surface form and how often it is used. */
function collectTagCounts(files: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of files) {
    forEachTagLine(fs.readFileSync(path.join(GUIDES_DIR, file), 'utf8'), value => {
      const { bare } = unquote(value)
      counts.set(bare, (counts.get(bare) || 0) + 1)
    })
  }
  return counts
}

/** Walk the tag item lines inside a file's frontmatter, calling cb per value. */
function forEachTagLine(content: string, cb: (value: string) => void): void {
  const lines = content.split('\n')
  let inFrontmatter = false
  let inTags = false
  for (const line of lines) {
    if (line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true
        continue
      }
      break // end of frontmatter
    }
    if (!inFrontmatter) continue
    if (/^tags:\s*$/.test(line)) {
      inTags = true
      continue
    }
    if (inTags) {
      const m = line.match(TAG_ITEM)
      if (m && m[1].includes('-')) {
        cb(m[2])
      } else {
        inTags = false // a non-item line ends the tags block
      }
    }
  }
}

/** Build canonical map from case-only clusters with more than one form. */
function buildCanonicalMap(counts: Map<string, number>): Map<string, string> {
  const clusters = new Map<string, string[]>()
  for (const tag of counts.keys()) {
    const key = tag.toLowerCase()
    if (!clusters.has(key)) clusters.set(key, [])
    clusters.get(key)!.push(tag)
  }

  const map = new Map<string, string>()
  for (const forms of clusters.values()) {
    if (forms.length <= 1) continue
    // Prefer the more-capitalized existing form so the canonical follows the
    // dataset's Title Case / acronym convention (e.g. "Data Management",
    // "JWT") rather than whichever casing merely happens to be most frequent.
    // Ties on capitalization fall back to usage count, then alphabetical.
    const upperCount = (s: string) => (s.match(/[A-Z]/g) || []).length
    const canonical = [...forms].sort((a, b) => {
      const byUpper = upperCount(b) - upperCount(a)
      if (byUpper !== 0) return byUpper
      const byCount = (counts.get(b) || 0) - (counts.get(a) || 0)
      if (byCount !== 0) return byCount
      return a.localeCompare(b)
    })[0]
    for (const form of forms) {
      if (form !== canonical) map.set(form, canonical)
    }
  }
  return map
}

function rewriteFile(content: string, map: Map<string, string>): { content: string; changes: string[] } {
  const lines = content.split('\n')
  const changes: string[] = []
  let inFrontmatter = false
  let inTags = false
  const seen = new Set<string>()
  const out: string[] = []

  for (const line of lines) {
    if (line.trim() === '---') {
      if (!inFrontmatter) inFrontmatter = true
      else inFrontmatter = false
      inTags = false
      seen.clear()
      out.push(line)
      continue
    }
    if (inFrontmatter && /^tags:\s*$/.test(line)) {
      inTags = true
      out.push(line)
      continue
    }
    if (inFrontmatter && inTags) {
      const m = line.match(TAG_ITEM)
      if (m && m[1].includes('-')) {
        const { bare, quote } = unquote(m[2])
        const canonical = map.get(bare) || bare
        if (seen.has(canonical)) {
          changes.push(`  drop duplicate "${bare}"`)
          continue // drop the duplicate line entirely
        }
        seen.add(canonical)
        if (canonical !== bare) {
          changes.push(`  "${bare}" -> "${canonical}"`)
          out.push(`${m[1]}${quote}${canonical}${quote}`)
        } else {
          out.push(line)
        }
        continue
      } else {
        inTags = false
      }
    }
    out.push(line)
  }
  return { content: out.join('\n'), changes }
}

function main(): void {
  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'))
  const counts = collectTagCounts(files)
  const map = buildCanonicalMap(counts)

  console.log(`Case-variant tags to normalize: ${map.size}`)
  ;[...map.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([from, to]) => console.log(`  "${from}" -> "${to}"`))

  let changedFiles = 0
  for (const file of files) {
    const full = path.join(GUIDES_DIR, file)
    const original = fs.readFileSync(full, 'utf8')
    const { content, changes } = rewriteFile(original, map)
    if (content !== original) {
      fs.writeFileSync(full, content)
      changedFiles++
      console.log(`\n${file}:`)
      changes.forEach(c => console.log(c))
    }
  }
  console.log(`\nDone. ${changedFiles} file(s) updated.`)
}

main()
