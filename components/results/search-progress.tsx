"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Check, Loader2, Plane, SlashIcon } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export interface RouteActivity {
  index: number
  origin: string
  originAirport: string
  destination: string
  destAirport: string
  weekLabel: string
  status: "fetching" | "done"
  cached?: boolean
  routable?: boolean
  cheapestUsdEach?: number | null
}

export interface SearchProgressState {
  total: number
  done: number
  current: RouteActivity | null
  feed: RouteActivity[] // most recently completed first
}

function usd(n: number) {
  return `$${Math.round(n).toLocaleString()}`
}

export function SearchProgress({ state }: { state: SearchProgressState }) {
  const { total, done, current, feed } = state
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
              <Plane className="size-5 animate-pulse" aria-hidden />
            </span>
            <div>
              <h3 className="text-base font-semibold leading-tight">Pricing flights</h3>
              <p className="text-sm text-muted-foreground">
                {total > 0 ? `${done} of ${total} routes priced` : "Building your search plan…"}
              </p>
            </div>
          </div>
          <span className="tabular-nums text-2xl font-semibold text-primary">{pct}%</span>
        </div>

        <Progress value={pct} className="h-2" aria-label={`Search ${pct}% complete`} />

        <div className="min-h-6" aria-live="polite">
          {current && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${current.index}-${current.status}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 text-sm"
              >
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                <span className="text-muted-foreground">Searching</span>
                <span className="font-medium">{current.origin}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">{current.destination}</span>
                <span className="truncate text-muted-foreground">· {current.weekLabel}</span>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {feed.map((r) => (
              <motion.li
                key={`${r.index}`}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
              >
                <span
                  className={
                    "grid size-5 shrink-0 place-items-center rounded-full " +
                    (r.routable ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")
                  }
                >
                  {r.routable ? <Check className="size-3" aria-hidden /> : <SlashIcon className="size-3" aria-hidden />}
                </span>
                <span className="font-medium">{r.originAirport}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">{r.destAirport}</span>
                <span className="truncate text-xs text-muted-foreground">· {r.weekLabel}</span>
                <span className="ml-auto shrink-0 tabular-nums font-medium">
                  {r.routable && r.cheapestUsdEach != null ? (
                    <>
                      {usd(r.cheapestUsdEach)}
                      <span className="text-xs font-normal text-muted-foreground"> /seat</span>
                    </>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">no route</span>
                  )}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </CardContent>
    </Card>
  )
}
