import { DealListSkeleton } from '@/components/ui/Skeleton'

export default function BrandDealsLoading() {
  return (
    <main style={{ flex: 1, minWidth: 0, padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)' }}>
      <div style={{ maxWidth: 1220, margin: '0 auto' }}>
        <div
          style={{
            borderRadius: 26,
            border: '1px solid rgba(255,255,255,.85)',
            background: 'rgba(255,255,255,.5)',
            backdropFilter: 'blur(26px) saturate(150%)',
            WebkitBackdropFilter: 'blur(26px) saturate(150%)',
            boxShadow: '0 34px 66px -34px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.9)',
            padding: 'clamp(18px, 2.6vw, 28px)',
          }}
        >
          {/* Header skeleton */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 18 }}>
            <div>
              <div className="skeleton" style={{ height: 42, width: 200, borderRadius: 8 }} />
              <div className="skeleton" style={{ height: 18, width: 160, borderRadius: 8, marginTop: 12 }} />
            </div>
            <div className="skeleton" style={{ width: 140, height: 42, borderRadius: 999 }} />
          </div>
          {/* Filter strip skeleton */}
          <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(120,130,150,.22)', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 7 }}>
              {[65, 80, 90, 75, 85, 80, 72].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: 36, width: w, borderRadius: 999 }} />
              ))}
            </div>
          </div>
          {/* Deal rows */}
          <DealListSkeleton rows={6} />
        </div>
      </div>
    </main>
  )
}
