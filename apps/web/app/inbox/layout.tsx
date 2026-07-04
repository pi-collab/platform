import BrandNav from '@/components/BrandNav'

export const metadata = {
  title: 'Inbox',
  robots: { index: false, follow: false },
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
