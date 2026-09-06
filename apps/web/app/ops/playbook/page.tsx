import { redirect } from 'next/navigation'
import { Space_Grotesk, Instrument_Serif } from 'next/font/google'
import { requireOps } from '@/lib/ops-capabilities'
import { PLAYBOOK_MD } from '@/content/playbook'
import { splitPlaybook, type Block, type Inline } from '@/lib/playbook-markdown'
import './playbook.css'

export const metadata = { title: 'The Guapd Playbook · Ops', robots: { index: false, follow: false } }

/* Space Grotesk is the design reference's face and is not among the app's
   loaded fonts. Imported here rather than in the root layout so it ships with
   this one internal page and not with every visitor's first paint. */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--pb-sans',
  display: 'swap',
})
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  variable: '--pb-serif',
  display: 'swap',
})

/**
 * The Guapd Playbook.
 *
 * Read by the outreach team and by founders. Rendered from the markdown in
 * content/playbook.ts, which is the source of truth — nothing here restates its
 * words, including the title and standfirst in the dark band, so editing the
 * markdown is the only thing anyone has to do to change this page.
 */
export default async function PlaybookPage() {
  const actor = await requireOps('playbook.read')
  if (!actor) redirect('/login/brand')

  const { title, lead, body } = splitPlaybook(PLAYBOOK_MD)

  return (
    <div className={`pb ${spaceGrotesk.variable} ${instrumentSerif.variable}`}>
      <article className="pb__doc">
        <header className="pb__header">
          <div className="pb__mark">
            <span className="pb__dot" aria-hidden="true"><span>g</span></span>
            <span className="pb__wm">guapd</span>
          </div>
          <h1>{title}</h1>
          {lead.map((para, i) => (
            <p key={i} className="pb__lead"><Runs runs={para} /></p>
          ))}
        </header>

        {body.map((block, i) => <BlockView key={i} block={block} />)}
      </article>
    </div>
  )
}

function Runs({ runs }: { runs: Inline[] }) {
  return (
    <>
      {runs.map((run, i) => {
        if (run.kind === 'bold') return <strong key={i}>{run.text}</strong>
        if (run.kind === 'italic') return <em key={i}>{run.text}</em>
        return <span key={i}>{run.text}</span>
      })}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'hr':
      return <hr />
    case 'heading': {
      const inner = <Runs runs={block.content} />
      if (block.level === 1) return <h2>{inner}</h2>   // only one h1 per page, in the band
      if (block.level === 2) return <h2>{inner}</h2>
      if (block.level === 3) return <h3>{inner}</h3>
      return <h4>{inner}</h4>
    }
    case 'ul':
      return (
        <ul>
          {block.items.map((item, i) => <li key={i}><Runs runs={item} /></li>)}
        </ul>
      )
    case 'ol':
      return (
        <ol>
          {block.items.map((item, i) => <li key={i}><Runs runs={item} /></li>)}
        </ol>
      )
    case 'paragraph':
      return <p><Runs runs={block.content} /></p>
  }
}
