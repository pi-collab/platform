import './globals.css'
import './marketing.css'
import { BRAND_NAME } from '@/lib/content'
import AnimationProvider from '@/components/AnimationProvider'
import MouseGlow from '@/components/MouseGlow'

export const metadata = {
  title:       BRAND_NAME,
  description: 'Brand–creator deals without the chaos.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnimationProvider />
        <MouseGlow />
        {children}
      </body>
    </html>
  )
}
