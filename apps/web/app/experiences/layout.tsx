import BrandNav from '@/components/BrandNav'

export const metadata = {
  title: 'Experiences',
  robots: { index: false, follow: false },
}

export default function ExperiencesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
