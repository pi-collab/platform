import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Deals',
  robots: { index: false, follow: false },
}

export default function DealsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-page="brand">
      <Nav audience="brand" />
      <main style={{ minHeight: '100vh', paddingTop: 'var(--nav-height)' }}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
