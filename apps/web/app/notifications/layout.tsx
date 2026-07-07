import BrandNav from '@/components/BrandNav'

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
