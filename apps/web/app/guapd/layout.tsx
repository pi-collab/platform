import BrandNav from '@/components/BrandNav'

/* The brand portal's shell, copied per route like every brand route (see
   app/pricing/layout.tsx). /guapd/* is the STAFF area: the frame shows nothing
   sensitive, and every page runs experienceStaffGate before reading anything. */
export default function GuapdLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandNav />
      <main className="brand-main">{children}</main>
    </>
  )
}
