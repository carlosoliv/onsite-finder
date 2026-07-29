"use client"

import { motion } from "framer-motion"
import { Compass } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { WinnerTile } from "./winner-tile"
import { RankedList } from "./ranked-list"
import { Heatmap } from "./heatmap"
import type { SearchResult } from "@/lib/types"

export function ResultsDashboard({
  result,
  loading,
}: {
  result: SearchResult | null
  loading: boolean
}) {
  if (loading) return <LoadingState />
  if (!result) return <EmptyState />
  if (result.totals.length === 0) return <EmptyState />

  const weekLabels = new Map(result.weeks.map((w) => [w.id, w.label]))
  const [winner, runnerUp] = result.totals

  const sections = [
    <WinnerTile key="winner" winner={winner} runnerUp={runnerUp} weekLabels={weekLabels} />,
    <Heatmap key="heatmap" totals={result.totals} weeks={result.weeks} destinations={result.destinations} />,
    <RankedList key="ranked" totals={result.totals} weekLabels={weekLabels} />,
  ]

  return (
    <div className="flex flex-col gap-6">
      {sections.map((s, i) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
        >
          {s}
        </motion.div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-100 flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-accent text-primary">
          <Compass className="size-7" aria-hidden />
        </div>
        <h3 className="text-lg font-semibold">No results yet</h3>
        <p className="max-w-xs text-pretty text-sm text-muted-foreground">
          Add your team&apos;s cities and candidate weeks, then run the search to see the cheapest onsite ranked in USD.
        </p>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-44 rounded-2xl" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
