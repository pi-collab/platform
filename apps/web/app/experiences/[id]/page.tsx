import { notFound } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import ViewFile from './ViewFile'
import './brand-experience.css'

export const dynamic = 'force-dynamic'

/**
 * A brand's Experience, as the brand sees it: ONLY the deliverables Guapd has
 * released (0538). The first piece of the brand-facing Experience; the full
 * brand portal is Phase 6.
 *
 * Everything comes from brand_experience_deliverables, which checks in
 * Postgres that the caller is a member of THIS Experience's brand and returns
 * the released version of each live release: the creator's name, the label,
 * the link or file, when it was shared and the decision on record. Never other
 * versions, unreleased items, who submitted, Guapd's notes, handles, ids or
 * any money. Decisions are recorded by Guapd (brand self-service is Phase 6).
 */
interface BrandItem {
  release_id: string
  creator_name: string | null
  label: string
  kind: 'link' | 'file'
  url: string | null
  file_name: string | null
  shared_at: string
  decision: 'approved' | 'changes_requested' | null
  decided_at: string | null
}
interface BrandView { title: string; brand_name: string; shoot_date: string | null; shoot_city: string | null; items: BrandItem[] }

export default async function BrandExperiencePage({ params }: { params: { id: string } }) {
  await verifyBrand()
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound()
  const { data, error } = await createClient().rpc('brand_experience_deliverables', { p_experience_id: params.id })
  if (error || !data) notFound()
  const v = data as BrandView

  const groups = new Map<string, BrandItem[]>()
  for (const i of v.items) {
    const k = i.creator_name ?? 'Creator'
    groups.set(k, [...(groups.get(k) ?? []), i])
  }
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const date = v.shoot_date ? fmt(`${v.shoot_date}T00:00:00`) : null

  return (
    <div className="bx-page">
      <section className="surface bx-hero">
        <div className="bx-kicker">{v.brand_name} · Managed by Guapd</div>
        <h1 className="bx-h1">{v.title}</h1>
        {(date || v.shoot_city) && <p className="bx-sub">Shoot{date ? ` on ${date}` : ''}{v.shoot_city ? ` in ${v.shoot_city}` : ''}</p>}
      </section>

      <section className="surface bx-card" aria-labelledby="bx-deliv">
        <h2 id="bx-deliv" className="bx-h2">Deliverables</h2>
        <p className="bx-note">What Guapd has shared with you so far. To approve one or ask for a change, reply to Guapd on WhatsApp or at contact@guapd.com.</p>
        {v.items.length === 0 ? (
          <p className="bx-empty">Nothing shared yet. Guapd will email you when the first deliverables are ready.</p>
        ) : (
          Array.from(groups.entries()).map(([creator, items]) => (
            <div key={creator} className="bx-group">
              <div className="bx-creator">{creator}</div>
              {items.map((i) => (
                <div key={i.release_id} className="bx-row">
                  <div>
                    <div className="bx-label">{i.label}</div>
                    <div className="bx-when">Shared {fmt(i.shared_at)}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {i.kind === 'link' && i.url
                      ? <a className="bx-link" href={i.url} target="_blank" rel="noreferrer noopener">{i.url}</a>
                      : <ViewFile releaseId={i.release_id} fileName={i.file_name} />}
                  </div>
                  <div>
                    {i.decision === 'approved' ? <span className="bx-chip bx-ok">Approved</span>
                      : i.decision === 'changes_requested' ? <span className="bx-chip bx-chg">Changes asked</span>
                      : <span className="bx-chip bx-new">New</span>}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  )
}
