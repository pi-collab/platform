import BrandNav from '@/components/BrandNav'

export const metadata = {
  title: 'Browse Creators',
  robots: { index: false, follow: false },
}

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
