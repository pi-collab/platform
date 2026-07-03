import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export default function DashboardPage() {
  redirect('/deals')
}
