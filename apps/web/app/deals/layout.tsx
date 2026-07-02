import BrandNav from '@/components/BrandNav'

export const metadata = {
  title: 'Deals',
  robots: { index: false, follow: false },
}

export default function DealsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <BrandNav />
      <main style={{ minHeight: 'calc(100vh - 56px)' }}>
        {children}
      </main>
    </div>
  )
}
