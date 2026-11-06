import BrandNav from '@/components/BrandNav'

export const metadata = {
  title: 'Guapd AI',
  robots: { index: false, follow: false },
}

export default function GuapdAiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
