import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata = {
  title: 'Browse Creators',
  robots: { index: false, follow: false },
}

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
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
