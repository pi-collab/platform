'use client'

import React, { useRef, useEffect, useState } from 'react'
import { useScroll, useTransform, motion, type MotionValue } from 'framer-motion'

interface ContainerScrollProps {
  titleComponent: React.ReactNode
  children: React.ReactNode
}

export default function ContainerScroll({ titleComponent, children }: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const rotate = useTransform(scrollYProgress, [0, 1], isMobile ? [8, 0] : [20, 0])
  const scale = useTransform(scrollYProgress, [0, 1], isMobile ? [0.92, 1] : [1.05, 1])
  const translate = useTransform(scrollYProgress, [0, 1], isMobile ? [0, -40] : [0, -100])

  return (
    <div
      ref={containerRef}
      className="container-scroll"
    >
      <div className="container-scroll__inner" style={{ perspective: '1000px' }}>
        <Header translate={translate} titleComponent={titleComponent} />
        <Card rotate={rotate} scale={scale}>
          {children}
        </Card>
      </div>
    </div>
  )
}

function Header({ translate, titleComponent }: { translate: MotionValue<number>; titleComponent: React.ReactNode }) {
  return (
    <motion.div
      style={{ translateY: translate }}
      className="container-scroll__header"
    >
      {titleComponent}
    </motion.div>
  )
}

function Card({
  rotate,
  scale,
  children,
}: {
  rotate: MotionValue<number>
  scale: MotionValue<number>
  children: React.ReactNode
}) {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow:
          '0 4px 20px rgba(22,16,11,0.08), 0 20px 40px rgba(22,16,11,0.06), 0 40px 60px rgba(22,16,11,0.04)',
      }}
      className="container-scroll__card"
    >
      <div className="container-scroll__card-inner">
        {children}
      </div>
    </motion.div>
  )
}
