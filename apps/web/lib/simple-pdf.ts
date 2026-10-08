/**
 * A very small PDF writer: A4 pages, the two standard Helvetica fonts, text,
 * lines and filled boxes. Enough for a plain, printable document (the service
 * invoice) without adding a dependency.
 *
 * Text is WinAnsi (Latin-1): characters outside it are replaced, so callers
 * write money as "Rs." or "INR", never "₹".
 */

export type Font = 'regular' | 'bold'

// Glyph widths (1/1000 em) for ASCII 32..126, from the Helvetica AFM files.
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]

function clean(s: string): string {
  // Common typographic marks to plain ASCII; anything else outside Latin-1 → '?'.
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?')
}

export function textWidth(s: string, size: number, font: Font = 'regular'): number {
  const w = font === 'bold' ? W_BOLD : W_REG
  let t = 0
  for (const ch of clean(s)) {
    const c = ch.charCodeAt(0)
    t += c >= 32 && c <= 126 ? w[c - 32] : 556
  }
  return (t * size) / 1000
}

/** Split text into lines no wider than maxWidth (words kept whole unless one word alone is too wide). */
export function wrap(s: string, size: number, maxWidth: number, font: Font = 'regular'): string[] {
  const out: string[] = []
  for (const para of clean(s).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size, font) <= maxWidth || !line) line = next
      else { out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

const esc = (s: string) => clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
const n = (v: number) => (Math.round(v * 100) / 100).toString()

export class SimplePdf {
  readonly width = 595.28
  readonly height = 841.89
  private pages: string[][] = [[]]
  private get ops() { return this.pages[this.pages.length - 1] }

  addPage() { this.pages.push([]) }

  /** y is measured from the TOP of the page. */
  text(x: number, y: number, s: string, size = 10, font: Font = 'regular', gray = 0) {
    this.ops.push(`BT ${n(gray)} g /${font === 'bold' ? 'F2' : 'F1'} ${n(size)} Tf ${n(x)} ${n(this.height - y)} Td (${esc(s)}) Tj ET`)
  }

  textRight(xRight: number, y: number, s: string, size = 10, font: Font = 'regular', gray = 0) {
    this.text(xRight - textWidth(s, size, font), y, s, size, font, gray)
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.6, gray = 0.8) {
    this.ops.push(`${n(gray)} G ${n(width)} w ${n(x1)} ${n(this.height - y1)} m ${n(x2)} ${n(this.height - y2)} l S`)
  }

  box(x: number, y: number, w: number, h: number, gray = 0.95) {
    this.ops.push(`${n(gray)} g ${n(x)} ${n(this.height - y - h)} ${n(w)} ${n(h)} re f`)
  }

  toBytes(): Uint8Array {
    const objs: string[] = []
    const kids: number[] = []
    // 1 catalog, 2 pages, 3 F1, 4 F2, then (page, content) pairs.
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    let id = 5
    for (const ops of this.pages) {
      const stream = ops.join('\n')
      const pageId = id++, contentId = id++
      kids.push(pageId)
      objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`
      objs[contentId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
    }
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`

    let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    const offsets: number[] = []
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = Buffer.byteLength(body, 'latin1')
      body += `${i} 0 obj\n${objs[i]}\nendobj\n`
    }
    const xref = Buffer.byteLength(body, 'latin1')
    body += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
    for (let i = 1; i < objs.length; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
    body += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return new Uint8Array(Buffer.from(body, 'latin1'))
  }
}
