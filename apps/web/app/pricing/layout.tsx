import BrandNav from '@/components/BrandNav'

/**
 * The brand app's nav and main column, around the pricing page.
 *
 * Every other signed-in brand route — /dashboard, /deals, /campaigns,
 * /settings, /inbox, /browse, /notifications — has a layout of its own that
 * draws BrandNav. /pricing was added without one, so it rendered against the
 * ROOT layout alone: no nav, no brand-main column, no way back. A brand opened
 * it from the profile menu and the whole application disappeared around them.
 *
 * Deliberately a copy of app/settings/layout.tsx rather than anything cleverer
 * — the brand routes each carry their own, and one route quietly differing is
 * exactly what produced this.
 *
 * No `metadata` here: page.tsx sets its own, and a layout export would only
 * compete with it.
 */
export default function BrandPricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
