'use client'

/**
 * Skeleton — shimmer placeholder from the GUAPD design system.
 * Uses the .skeleton class (globals.css) for the shimmer animation.
 */

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export default function Skeleton({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />
}

/** Pre-built deal-row skeleton: 6-8 rows at h-[64px] with gap-2.5 */
export function DealListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-[10px]">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[64px] w-full" style={{ borderRadius: 16 }} />
      ))}
    </div>
  )
}
