"use client"

import { useEffect, useRef, useState } from "react"

export function CountUp({
  value,
  duration = 900,
  className,
  prefix = "$",
}: {
  value: number
  duration?: number
  className?: string
  prefix?: string
}) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const current = Math.round(from + (value - from) * eased)
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return (
    <span className={className}>
      {prefix}
      {display.toLocaleString("en-US")}
    </span>
  )
}
