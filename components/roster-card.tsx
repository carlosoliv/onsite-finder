"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2, Users, MapPin, Loader2, Plane } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { CITIES, findCity, airportsFor } from "@/lib/cities"
import { fetchAirportSuggestions } from "@/lib/airport-client"
import type { AirportSuggestion, OriginRow } from "@/lib/types"

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function emptyRow(): OriginRow {
  return { id: uid(), city: "", airport: "", currency: "", count: 1, canHost: true }
}

// Every airport IATA we already know about locally (primary + alternates), used
// to hide remote suggestions that would just duplicate a built-in city.
const KNOWN_CODES = new Set<string>(
  CITIES.flatMap((c) => [c.iata, ...(c.airports ?? []).map((a) => a.iata)]),
)

type Option =
  | { kind: "city"; label: string; sub: string; city: string }
  | { kind: "airport"; label: string; sub: string; suggestion: AirportSuggestion }

// Combobox for the city field: merges built-in cities with live Ignav airport
// results (only when a key is configured). Selecting a remote airport resolves
// a city that isn't in our built-in list.
function CityAirportInput({
  value,
  known,
  airport,
  currency,
  hasKey,
  onType,
  onSelectCity,
  onSelectAirport,
}: {
  value: string
  known: boolean
  airport: string
  currency: string
  hasKey: boolean
  onType: (v: string) => void
  onSelectCity: (city: string) => void
  onSelectAirport: (s: AirportSuggestion) => void
}) {
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState<AirportSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const query = value.trim()
  const showBadge = known && currency !== "" && !open

  const localMatches = useMemo(() => {
    if (!query) return CITIES.slice(0, 6)
    const q = query.toLowerCase()
    return CITIES.filter((c) => c.city.toLowerCase().includes(q)).slice(0, 6)
  }, [query])

  // Debounced remote lookup. Only runs when a key is configured and the query is
  // long enough; short-circuits to local-only behavior otherwise.
  useEffect(() => {
    if (!hasKey || !open || query.length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const results = await fetchAirportSuggestions(query, controller.signal)
        setRemote(results.filter((r) => !KNOWN_CODES.has(r.code)))
      } catch {
        setRemote([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query, hasKey, open])

  // Close on outside pointer down.
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [open])

  const options: Option[] = useMemo(() => {
    const cityOpts: Option[] = localMatches.map((c) => ({
      kind: "city",
      label: c.city,
      sub: `${c.iata} · ${c.currency}`,
      city: c.city,
    }))
    const airportOpts: Option[] = remote.map((s) => ({
      kind: "airport",
      label: `${s.code} · ${s.city || s.name}`,
      sub: `${s.name}${s.country ? ` · ${s.country}` : ""} · ${s.currency}`,
      suggestion: s,
    }))
    return [...cityOpts, ...airportOpts]
  }, [localMatches, remote])

  useEffect(() => {
    setActive(0)
  }, [open, options.length])

  function choose(opt: Option | undefined) {
    if (!opt) return
    if (opt.kind === "city") onSelectCity(opt.city)
    else onSelectAirport(opt.suggestion)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Respect IME composition so Enter that confirms CJK input never submits.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      if (open && options[active]) {
        e.preventDefault()
        choose(options[active])
      }
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const showRemoteSection = hasKey && query.length >= 2

  return (
    <div ref={wrapRef} className="relative flex-1">
      <Input
        value={value}
        placeholder="City or airport (e.g. Dublin, AUS)"
        aria-label="City or airport"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          onType(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={showBadge ? "pr-20" : undefined}
      />
      {showBadge && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <Badge variant="outline" className="tnums text-[10px]">
            {airport} · {currency}
          </Badge>
        </span>
      )}

      {open && (options.length > 0 || (showRemoteSection && loading)) && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {options.map((opt, i) => {
            const key = opt.kind === "city" ? `c-${opt.city}` : `a-${opt.suggestion.code}`
            return (
              <button
                key={key}
                type="button"
                // Use pointer down so selection fires before the input blurs.
                onPointerDown={(e) => {
                  e.preventDefault()
                  choose(opt)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
                  i === active ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                {opt.kind === "city" ? (
                  <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Plane className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground tnums">{opt.sub}</span>
              </button>
            )
          })}
          {showRemoteSection && loading && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Searching airports…
            </div>
          )}
          {showRemoteSection && !loading && remote.length === 0 && options.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching airports.</div>
          )}
        </div>
      )}
    </div>
  )
}

export function RosterCard({
  origins,
  setOrigins,
  hasKey = false,
}: {
  origins: OriginRow[]
  setOrigins: (rows: OriginRow[]) => void
  hasKey?: boolean
}) {
  const totalTravelers = origins.reduce((s, r) => s + (r.city ? r.count : 0), 0)
  const validCities = origins.filter((r) => r.city).length
  const hostCities = origins.filter((r) => r.city && r.canHost).length

  function update(id: string, patch: Partial<OriginRow>) {
    setOrigins(origins.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function onCityType(id: string, value: string) {
    const city = findCity(value)
    if (city) {
      // Exact match to a built-in city: default to its primary airport.
      update(id, { city: city.city, airport: city.iata, currency: city.currency })
    } else {
      update(id, { city: value, airport: "", currency: "" })
    }
  }

  function onSelectCity(id: string, name: string) {
    const city = findCity(name)
    if (city) update(id, { city: city.city, airport: city.iata, currency: city.currency })
  }

  function onSelectAirport(id: string, s: AirportSuggestion) {
    // Resolve a city/airport that isn't in our built-in list. The chosen airport
    // becomes the departure IATA; currency is derived server-side from country.
    update(id, { city: s.city || s.name, airport: s.code, currency: s.currency })
  }

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" aria-hidden />
              Team roster
            </CardTitle>
            <CardDescription>
              Where your team is based. Cities marked &ldquo;can host&rdquo; are also candidate destinations.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1 tnums">
            <Users className="size-3" aria-hidden />
            {totalTravelers} across {validCities}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {origins.map((row) => {
            const known = Boolean(row.airport)
            const airports = row.city ? airportsFor(row.city) : []
            const multiAirport = airports.length > 1
            return (
              <div key={row.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
                <div className="flex items-center gap-2">
                  <CityAirportInput
                    value={row.city}
                    known={known}
                    airport={row.airport}
                    currency={row.currency}
                    hasKey={hasKey}
                    onType={(v) => onCityType(row.id, v)}
                    onSelectCity={(name) => onSelectCity(row.id, name)}
                    onSelectAirport={(s) => onSelectAirport(row.id, s)}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={row.count}
                    aria-label="Number of travelers"
                    onChange={(e) => update(row.id, { count: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-16 tnums"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove city"
                    onClick={() => setOrigins(origins.filter((r) => r.id !== row.id))}
                    disabled={origins.length <= 1}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {known && (
                  <div className="flex items-center justify-between gap-2 pl-0.5">
                    {multiAirport ? (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="sr-only">Departure airport for {row.city}</span>
                        <select
                          value={row.airport}
                          aria-label={`Departure airport for ${row.city}`}
                          onChange={(e) => update(row.id, { airport: e.target.value })}
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs tnums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {airports.map((a) => (
                            <option key={a.iata} value={a.iata}>
                              {a.iata} · {a.name}
                            </option>
                          ))}
                        </select>
                        <span className="tnums">{row.currency}</span>
                      </label>
                    ) : (
                      // Single-airport cities already show their IATA in the inline
                      // badge above; this empty spacer keeps the checkbox right-aligned.
                      <span aria-hidden />
                    )}

                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={row.canHost}
                        onCheckedChange={(v) => update(row.id, { canHost: v === true })}
                        aria-label={`Can host an onsite in ${row.city}`}
                      />
                      Can host onsite
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={() => setOrigins([...origins, emptyRow()])} className="self-start">
            <Plus data-icon="inline-start" />
            Add city
          </Button>
          <span className="text-xs text-muted-foreground">
            {hostCities} of {validCities} can host
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
