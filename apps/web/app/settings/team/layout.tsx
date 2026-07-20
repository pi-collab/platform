import BrandNav from '@/components/BrandNav'

export const metadata = { title: 'Team Settings', robots: { index: false, follow: false } }

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
