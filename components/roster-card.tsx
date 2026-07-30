"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Trash2, Users, MapPin, Loader2, Sparkles, CircleAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CITIES, findCity } from "@/lib/cities"
import { resolveCity } from "@/lib/resolve-city-client"
import type { OriginRow } from "@/lib/types"

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function emptyRow(): OriginRow {
  return { id: uid(), city: "", airport: "", currency: "", count: 1 }
}

type LookupStatus = "idle" | "searching" | "notfound" | "error"

export function RosterCard({
  origins,
  setOrigins,
}: {
  origins: OriginRow[]
  setOrigins: (rows: OriginRow[]) => void
}) {
  const totalTravelers = origins.reduce((s, r) => s + (r.city ? r.count : 0), 0)
  const validCities = origins.filter((r) => r.airport).length

  // Per-row async lookup state for cities typed that aren't in the built-in list.
  const [lookup, setLookup] = useState<Record<string, LookupStatus>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const controllers = useRef<Record<string, AbortController>>({})

  // Keep a ref to the latest origins so debounced callbacks patch fresh state.
  const originsRef = useRef(origins)
  originsRef.current = origins

  const patch = useCallback(
    (id: string, next: Partial<OriginRow>) => {
      setOrigins(originsRef.current.map((r) => (r.id === id ? { ...r, ...next } : r)))
    },
    [setOrigins],
  )

  const setStatus = useCallback((id: string, status: LookupStatus) => {
    setLookup((prev) => (prev[id] === status ? prev : { ...prev, [id]: status }))
  }, [])

  // Clean up any pending timers / requests on unmount.
  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout)
      Object.values(controllers.current).forEach((c) => c.abort())
    }
  }, [])

  const runResolve = useCallback(
    async (id: string, value: string) => {
      controllers.current[id]?.abort()
      const controller = new AbortController()
      controllers.current[id] = controller
      setStatus(id, "searching")
      try {
        const city = await resolveCity(value, controller.signal)
        // Bail if the user has since changed this field.
        const current = originsRef.current.find((r) => r.id === id)
        if (!current || current.city.trim().toLowerCase() !== value.trim().toLowerCase()) return

        if (city) {
          patch(id, {
            city: city.city,
            airport: city.iata,
            currency: city.currency,
            country: city.country,
            lat: city.lat,
            lng: city.lng,
            resolved: true,
          })
          setStatus(id, "idle")
        } else {
          setStatus(id, "notfound")
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return
        setStatus(id, "error")
      }
    },
    [patch, setStatus],
  )

  function onCityChange(id: string, value: string) {
    clearTimeout(timers.current[id])
    controllers.current[id]?.abort()

    const known = findCity(value)
    if (known) {
      setStatus(id, "idle")
      patch(id, {
        city: known.city,
        airport: known.iata,
        currency: known.currency,
        country: known.country,
        lat: known.lat,
        lng: known.lng,
        resolved: false,
      })
      return
    }

    // Unknown city: clear routing info, then debounce an AI-powered lookup.
    patch(id, { city: value, airport: "", currency: "", country: undefined, lat: undefined, lng: undefined, resolved: false })

    const trimmed = value.trim()
    if (trimmed.length < 3) {
      setStatus(id, "idle")
      return
    }
    setStatus(id, "searching")
    timers.current[id] = setTimeout(() => runResolve(id, trimmed), 600)
  }

  function removeRow(id: string) {
    clearTimeout(timers.current[id])
    controllers.current[id]?.abort()
    setOrigins(origins.filter((r) => r.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" aria-hidden />
              Team roster
            </CardTitle>
            <CardDescription>
              Where your team is based. Type any city &mdash; we&apos;ll find its airport automatically.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1 tnums">
            <Users className="size-3" aria-hidden />
            {totalTravelers} across {validCities}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <datalist id="city-options">
          {CITIES.map((c) => (
            <option key={c.iata} value={c.city} />
          ))}
        </datalist>

        <div className="flex flex-col gap-2">
          {origins.map((row) => {
            const known = Boolean(row.airport)
            const status = lookup[row.id] ?? "idle"
            const searching = status === "searching"
            return (
              <div key={row.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      list="city-options"
                      value={row.city}
                      placeholder="City (e.g. Dublin)"
                      aria-label="City"
                      onChange={(e) => onCityChange(row.id, e.target.value)}
                      className="pr-24"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
                      {searching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
                      {!searching && known && (
                        <Badge variant="outline" className="tnums gap-1 text-[10px]">
                          {row.resolved && <Sparkles className="size-2.5 text-primary" aria-hidden />}
                          {row.airport} · {row.currency}
                        </Badge>
                      )}
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={row.count}
                    aria-label="Number of travelers"
                    onChange={(e) => patch(row.id, { count: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-20 tnums"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove city"
                    onClick={() => removeRow(row.id)}
                    disabled={origins.length <= 1}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {searching && (
                  <p className="pl-1 text-xs text-muted-foreground">Searching for &ldquo;{row.city}&rdquo;&hellip;</p>
                )}
                {status === "notfound" && (
                  <p className="flex items-center gap-1 pl-1 text-xs text-destructive">
                    <CircleAlert className="size-3" aria-hidden />
                    Couldn&apos;t find that city. Try a nearby major city.
                  </p>
                )}
                {status === "error" && (
                  <p className="flex items-center gap-1 pl-1 text-xs text-destructive">
                    <CircleAlert className="size-3" aria-hidden />
                    City search failed. Check your connection and try again.
                  </p>
                )}
                {!searching && status === "idle" && row.resolved && known && (
                  <p className="flex items-center gap-1 pl-1 text-xs text-muted-foreground">
                    <Sparkles className="size-3 text-primary" aria-hidden />
                    Auto-matched to {row.airport} ({row.country}).
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <Button variant="outline" onClick={() => setOrigins([...origins, emptyRow()])} className="self-start">
          <Plus data-icon="inline-start" />
          Add city
        </Button>
      </CardContent>
    </Card>
  )
}
