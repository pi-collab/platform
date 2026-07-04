import BrandNav from '@/components/BrandNav'

export const metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <BrandNav />
      <main style={{ minHeight: 'calc(100vh - 56px)' }}>
        {children}
      </main>
    </div>
  )
}
