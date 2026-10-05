import OpsTopBar from '@/components/ops/OpsTopBar'
import { verifyOpsAccess } from '@/lib/ops-auth'

/**
 * The Experience ops frame, in the brand portal's design: the same
 * `.brand-main` scope every brand route uses (tokens, Schibsted type, the
 * #F7F7F4 page) and a brand-styled top bar. The frame shows nothing sensitive;
 * each page runs experienceOpsGate() before it reads anything.
 */
export default async function ExperiencesOpsLayout({ children }: { children: React.ReactNode }) {
  const user = await verifyOpsAccess()
  return (
    <main className="brand-main" style={{ minHeight: '100vh' }}>
      <OpsTopBar email={user?.email ?? null} />
      {children}
    </main>
  )
}
