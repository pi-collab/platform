import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicStorefront } from './actions'
import StorefrontPage from './StorefrontPage'

// ISR: cached at edge, revalidated every 60 seconds
export const revalidate = 60

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getPublicStorefront(params.slug)
  if (!data) return { title: 'Creator Not Found — Guapd' }

  return {
    title: `${data.display_name} — Guapd`,
    description: data.headline || `${data.display_name} on Guapd`,
    openGraph: {
      title: `${data.display_name} — Guapd`,
      description: data.headline || `${data.display_name} on Guapd`,
      type: 'profile',
    },
  }
}

export default async function CreatorStorefrontRoute({ params }: Props) {
  const data = await getPublicStorefront(params.slug)
  if (!data) notFound()

  return <StorefrontPage data={data} />
}
