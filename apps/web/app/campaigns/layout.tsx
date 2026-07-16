import BrandNav from '@/components/BrandNav'

export const metadata = {
  title: 'Campaigns',
  robots: { index: false, follow: false },
}

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
