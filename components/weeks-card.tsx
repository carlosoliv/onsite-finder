"use client"

import { useState } from "react"
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Week } from "@/lib/types"

function iso(d: Date) {
  return format(d, "yyyy-MM-dd")
}

export function weekFromDate(day: Date): Week {
  const monday = startOfWeek(day, { weekStartsOn: 1 })
  const friday = addDays(monday, 4)
  return {
    id: iso(monday),
    label: `${format(monday, "EEE MMM d")} – ${format(friday, "EEE MMM d")}`,
    depart: iso(monday),
    return: iso(friday),
  }
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function WeeksCard({
  weeks,
  setWeeks,
}: {
  weeks: Week[]
  setWeeks: (w: Week[]) => void
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [hoverWeek, setHoverWeek] = useState<string | null>(null)

  const monthStart = startOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = addDays(startOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }), 6)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const rows: Date[][] = []
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))

  const today = startOfDay(new Date())
  const selectedIds = new Set(weeks.map((w) => w.id))

  function toggleWeek(day: Date) {
    const w = weekFromDate(day)
    if (selectedIds.has(w.id)) {
      setWeeks(weeks.filter((x) => x.id !== w.id))
    } else {
      setWeeks([...weeks, w].sort((a, b) => a.depart.localeCompare(b.depart)))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" aria-hidden />
              Candidate weeks
            </CardTitle>
            <CardDescription>Click any weekday to add its Mon–Fri work week.</CardDescription>
          </div>
          <Badge variant="secondary" className="tnums">
            {weeks.length} selected
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{format(cursor, "MMMM yyyy")}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {DOW.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {rows.map((week, ri) => {
              const wid = weekFromDate(week[0]).id
              const isSelected = selectedIds.has(wid)
              const isHover = hoverWeek === wid
              return (
                <div
                  key={ri}
                  className="grid grid-cols-7 gap-1"
                  onMouseEnter={() => setHoverWeek(wid)}
                  onMouseLeave={() => setHoverWeek(null)}
                >
                  {week.map((day, di) => {
                    const inMonth = isSameMonth(day, cursor)
                    const isWeekday = di < 5
                    const isPast = isBefore(day, today)
                    const active = isWeekday && (isSelected || isHover)
                    return (
                      <button
                        key={di}
                        type="button"
                        disabled={!isWeekday}
                        onClick={() => toggleWeek(day)}
                        className={cn(
                          "relative flex h-9 items-center justify-center rounded-md text-sm tnums transition-colors",
                          isWeekday ? "cursor-pointer" : "cursor-default text-muted-foreground/40",
                          !inMonth && "opacity-40",
                          isWeekday && !active && "hover:bg-muted",
                          active && !isSelected && "bg-accent text-accent-foreground",
                          isSelected && isWeekday && "bg-primary text-primary-foreground",
                          isPast && isWeekday && "text-muted-foreground/50",
                        )}
                        aria-pressed={isSelected}
                        aria-label={format(day, "EEEE MMMM d")}
                      >
                        {format(day, "d")}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {weeks.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {weeks.map((w) => (
              <Badge key={w.id} variant="outline" className="gap-1.5 py-1 pl-2.5 pr-1 text-xs tnums">
                {w.label}
                <button
                  type="button"
                  onClick={() => setWeeks(weeks.filter((x) => x.id !== w.id))}
                  aria-label={`Remove ${w.label}`}
                  className="grid size-4 place-items-center rounded-full hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
