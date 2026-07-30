"use client"

import { useMemo, useState } from "react"
import { addDays, startOfWeek } from "date-fns"
import { Plane, Search, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { RosterCard, emptyRow } from "@/components/roster-card"
import { WeeksCard, weekFromDate } from "@/components/weeks-card"
import { RulesCard } from "@/components/rules-card"
import { SetupBanner } from "@/components/setup-banner"
import { ResultsDashboard } from "@/components/results/results-dashboard"
import { SearchProgress, type RouteActivity, type SearchProgressState } from "@/components/results/search-progress"
import { streamSearch } from "@/lib/search-client"
import { DEFAULT_POLICY } from "@/lib/policy"
import { findCity } from "@/lib/cities"
import type { OriginRow, PolicyConfig, SearchResult, Week } from "@/lib/types"

const EMPTY_PROGRESS: SearchProgressState = { total: 0, done: 0, current: null, feed: [] }

function seedRows(): OriginRow[] {
  return [
    ["Dublin", 3],
    ["San Francisco", 6],
    ["New York", 5],
  ].map(([name, count]) => {
    const c = findCity(name as string)!
    return {
      id: Math.random().toString(36).slice(2, 9),
      city: c.city,
      airport: c.iata,
      currency: c.currency,
      count: count as number,
      canHost: true,
    }
  })
}

function seedWeeks(): Week[] {
  const base = startOfWeek(addDays(new Date(), 35), { weekStartsOn: 1 })
  return [weekFromDate(base), weekFromDate(addDays(base, 21))]
}

export function OnsiteApp({ hasKey }: { hasKey: boolean }) {
  const [origins, setOrigins] = useState<OriginRow[]>(seedRows)
  const [weeks, setWeeks] = useState<Week[]>(seedWeeks)
  const [policy, setPolicy] = useState<PolicyConfig>(DEFAULT_POLICY)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SearchProgressState>(EMPTY_PROGRESS)

  const validOrigins = useMemo(() => origins.filter((o) => o.airport && o.count > 0), [origins])
  const hostOrigins = useMemo(() => validOrigins.filter((o) => o.canHost), [validOrigins])
  const canSearch = validOrigins.length >= 2 && hostOrigins.length >= 1 && weeks.length >= 1

  async function run() {
    if (!canSearch || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setProgress(EMPTY_PROGRESS)

    try {
      await streamSearch({ origins: validOrigins, weeks, policy }, (event) => {
        if (event.type === "start") {
          setProgress({ total: event.total, done: 0, current: null, feed: [] })
        } else if (event.type === "route") {
          const activity: RouteActivity = {
            index: event.index,
            origin: event.origin,
            originAirport: event.originAirport,
            destination: event.destination,
            destAirport: event.destAirport,
            weekLabel: event.weekLabel,
            status: event.status,
            cached: event.cached,
            routable: event.routable,
            cheapestUsdEach: event.cheapestUsdEach,
          }
          setProgress((prev) => {
            if (event.status === "fetching") {
              return { ...prev, current: activity }
            }
            // done: bump the counter and prepend to the feed
            return {
              ...prev,
              done: Math.max(prev.done, event.index),
              current: prev.current?.index === event.index ? null : prev.current,
              feed: [activity, ...prev.feed],
            }
          })
        } else if (event.type === "result") {
          setResult(event.result)
        } else if (event.type === "error") {
          setError(event.message)
          setResult(null)
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <SetupBanner hasKey={hasKey} />

      <div className="grid gap-6 lg:grid-cols-[minmax(360px,420px)_1fr]">
        {/* Configure rail */}
        <div className="flex flex-col gap-4">
          <RosterCard origins={origins} setOrigins={setOrigins} />
          <WeeksCard weeks={weeks} setWeeks={setWeeks} />
          <RulesCard policy={policy} setPolicy={setPolicy} />

          <div className="sticky bottom-4 z-10">
            <Button
              size="lg"
              onClick={run}
              disabled={!canSearch || loading}
              className="gradient-brand h-12 w-full text-base font-semibold text-primary-foreground shadow-lg disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Plane className="animate-pulse" data-icon="inline-start" />
                  Pricing flights…
                </>
              ) : (
                <>
                  <Search data-icon="inline-start" />
                  Find cheapest onsite
                </>
              )}
            </Button>
            {!canSearch && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {hostOrigins.length < 1 && validOrigins.length >= 2
                  ? "Mark at least 1 city as able to host an onsite."
                  : "Add at least 2 cities and 1 week to search."}
              </p>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Search failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading ? (
            <SearchProgress state={progress} />
          ) : (
            <ResultsDashboard result={result} loading={false} />
          )}
        </div>
      </div>
    </div>
  )
}
