/**
 * A small markdown parser for the playbook, and nothing else.
 *
 * ── Why not a library ──────────────────────────────────────────────────────
 * CLAUDE.md says flag before adding a dependency. The document uses six pieces
 * of markdown — headings, bullets, ordered lists, bold, italic and rules — with
 * no tables, code fences, links, blockquotes or nesting anywhere in its 381
 * lines. A markdown library would be several hundred kilobytes to parse a
 * subset this small, and it would accept syntax the page has never been styled
 * for.
 *
 * If the playbook ever grows a table or a link, add support here deliberately
 * rather than letting it render as literal pipes on an internal page nobody
 * checks.
 *
 * ── Output is a tree, not HTML ─────────────────────────────────────────────
 * The parser returns structured nodes which the page renders as React elements.
 * No dangerouslySetInnerHTML, so there is no HTML-injection surface even though
 * the source is ours today.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'ul'; items: Inline[][] }
  | { kind: 'ol'; items: Inline[][] }
  | { kind: 'hr' }

/**
 * Inline emphasis. Bold is matched before italic, because `**x**` also matches
 * the italic pattern and the wrong order turns every bold run into a pair of
 * stray asterisks wrapped around italics.
 */
export function parseInline(raw: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: raw.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] })
    else out.push({ kind: 'italic', text: m[2] })
    last = m.index + m[0].length
  }
  if (last < raw.length) out.push({ kind: 'text', text: raw.slice(last) })
  return out.length > 0 ? out : [{ kind: 'text', text: raw }]
}

export function parsePlaybook(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []

  function flushParagraph() {
    if (para.length === 0) return
    blocks.push({ kind: 'paragraph', content: parseInline(para.join(' ').trim()) })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') { flushParagraph(); continue }

    // A rule. Checked before headings so `---` is never read as anything else.
    if (/^-{3,}$/.test(trimmed)) { flushParagraph(); blocks.push({ kind: 'hr' }); continue }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4,
        content: parseInline(heading[2].trim()),
      })
      continue
    }

    // Lists are gathered greedily so consecutive items stay one <ul>/<ol>
    // rather than becoming a run of single-item lists with gaps between them.
    if (/^-\s+/.test(trimmed)) {
      flushParagraph()
      const items: Inline[][] = []
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^-\s+/, '')))
        i++
      }
      i--
      blocks.push({ kind: 'ul', items })
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph()
      const items: Inline[][] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^\d+\.\s+/, '')))
        i++
      }
      i--
      blocks.push({ kind: 'ol', items })
      continue
    }

    para.push(trimmed)
  }
  flushParagraph()
  return blocks
}

/**
 * The document's own title and standfirst, which the page lifts into the dark
 * header band. Returned separately so the band is not a hardcoded copy of text
 * that lives in the markdown — edit the markdown and the header follows.
 */
export function splitPlaybook(md: string): { title: string; lead: Inline[][]; body: Block[] } {
  const blocks = parsePlaybook(md)
  let title = 'The Guapd Playbook'
  const lead: Inline[][] = []
  let start = 0

  if (blocks[0]?.kind === 'heading' && blocks[0].level === 1) {
    title = blocks[0].content.map((c) => c.text).join('')
    start = 1
  }
  // The italic standfirst paragraphs directly under the title, up to the rule.
  for (let i = start; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.kind === 'hr') { start = i + 1; break }
    if (b.kind === 'paragraph') { lead.push(b.content); start = i + 1; continue }
    break
  }
  return { title, lead, body: blocks.slice(start) }
}
