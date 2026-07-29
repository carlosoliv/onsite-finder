"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatNative, formatUsd } from "@/lib/format"
import type { CityWeekTotal } from "@/lib/types"

function flagVariant(flag: string): "secondary" | "outline" | "destructive" {
  if (flag.includes("warning") || flag.includes("stop")) return "outline"
  return "secondary"
}

export function RankedList({
  totals,
  weekLabels,
}: {
  totals: CityWeekTotal[]
  weekLabels: Map<string, string>
}) {
  const [expanded, setExpanded] = useState<string | null>(totals[0] ? key(totals[0]) : null)
  const max = Math.max(...totals.map((t) => t.totalUsd), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranked options</CardTitle>
        <CardDescription>Every city × week combination, cheapest first. Click a row for the per-origin breakdown.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {totals.map((t, i) => {
          const k = key(t)
          const isOpen = expanded === k
          const pct = Math.max(4, (t.totalUsd / max) * 100)
          return (
            <div key={k} className="rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : k)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/60"
                aria-expanded={isOpen}
              >
                <span className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tnums",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate">
                      <span className="font-semibold">{t.destination}</span>
                      <span className="ml-2 text-sm text-muted-foreground tnums">{weekLabels.get(t.weekId)}</span>
                    </div>
                    <span className="shrink-0 font-semibold tnums">{formatUsd(t.totalUsd)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", i === 0 ? "gradient-brand" : "bg-brand-3")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Origin</TableHead>
                            <TableHead className="text-right">Travelers</TableHead>
                            <TableHead>Cabin</TableHead>
                            <TableHead className="text-right">Native</TableHead>
                            <TableHead className="text-right">$ each</TableHead>
                            <TableHead className="text-right">$ subtotal</TableHead>
                            <TableHead>Flags</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {t.byOrigin.map((b) => (
                            <TableRow key={b.origin}>
                              <TableCell className="font-medium">{b.origin}</TableCell>
                              <TableCell className="text-right tnums">{b.count}</TableCell>
                              <TableCell>
                                <Badge variant={b.cabin === "PREMIUM_ECONOMY" ? "secondary" : "outline"} className="text-[10px]">
                                  {b.cabin === "PREMIUM_ECONOMY" ? "Prem. econ." : "Economy"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs tnums">
                                {formatNative(b.nativePrice, b.nativeCurrency)}
                              </TableCell>
                              <TableCell className="text-right tnums">{formatUsd(b.usdEach)}</TableCell>
                              <TableCell className="text-right font-semibold tnums">{formatUsd(b.usdSubtotal)}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {b.flags.map((f) => (
                                    <Badge key={f} variant={flagVariant(f)} className="text-[10px]">
                                      {f}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {t.unroutable.map((o) => (
                            <TableRow key={o}>
                              <TableCell className="font-medium">{o}</TableCell>
                              <TableCell colSpan={6}>
                                <Badge variant="destructive" className="text-[10px]">
                                  unroutable
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function key(t: CityWeekTotal) {
  return `${t.destination}-${t.weekId}`
}
