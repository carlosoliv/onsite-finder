"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatUsd } from "@/lib/format"
import type { CityWeekTotal, Week } from "@/lib/types"

// Interpolate light -> deep blurple based on relative cost.
function cellColor(t: number): { bg: string; light: boolean } {
  const from = [238, 242, 255] // #EEF2FF
  const to = [58, 52, 184] // #3A34B8
  const rgb = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return { bg: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, light: t < 0.55 }
}

export function Heatmap({
  totals,
  weeks,
  destinations,
}: {
  totals: CityWeekTotal[]
  weeks: Week[]
  destinations: string[]
}) {
  const lookup = new Map(totals.map((t) => [`${t.destination}-${t.weekId}`, t]))
  const values = totals.map((t) => t.totalUsd)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const cheapest = totals.reduce((a, b) => (b.totalUsd < a.totalUsd ? b : a))
  const cheapestKey = `${cheapest.destination}-${cheapest.weekId}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>City × week heatmap</CardTitle>
        <CardDescription>Total cost per destination and week. Lighter is cheaper; the cheapest cell is outlined.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-28 text-left text-xs font-medium text-muted-foreground" />
                {weeks.map((w) => (
                  <th key={w.id} className="px-1 pb-1 text-center text-[11px] font-medium text-muted-foreground tnums">
                    {w.label.split(" – ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {destinations.map((dest) => (
                <tr key={dest}>
                  <td className="pr-2 text-right text-xs font-medium">{dest}</td>
                  {weeks.map((w) => {
                    const k = `${dest}-${w.id}`
                    const cell = lookup.get(k)
                    if (!cell) return <td key={w.id} />
                    const t = max === min ? 0.5 : (cell.totalUsd - min) / (max - min)
                    const { bg, light } = cellColor(t)
                    const isCheapest = k === cheapestKey
                    return (
                      <td key={w.id} className="p-0">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className={cn(
                                  "flex h-11 w-full min-w-16 items-center justify-center rounded-md text-xs font-semibold tnums transition-transform hover:scale-[1.03]",
                                  isCheapest && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                                )}
                                style={{ backgroundColor: bg, color: light ? "#1A1F36" : "#ffffff" }}
                                aria-label={`${dest}, ${w.label}: ${formatUsd(cell.totalUsd)}`}
                              >
                                {formatUsd(cell.totalUsd, { compact: true })}
                              </button>
                            }
                          />
                          <TooltipContent>
                            {dest} · {w.label} · {formatUsd(cell.totalUsd)}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Cheaper</span>
          <div className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, #EEF2FF, #3A34B8)" }} />
          <span>Pricier</span>
        </div>
      </CardContent>
    </Card>
  )
}
