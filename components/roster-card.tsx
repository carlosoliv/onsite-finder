"use client"

import { Plus, Trash2, Users, MapPin } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CITIES, findCity } from "@/lib/cities"
import type { OriginRow } from "@/lib/types"

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function emptyRow(): OriginRow {
  return { id: uid(), city: "", airport: "", currency: "", count: 1 }
}

export function RosterCard({
  origins,
  setOrigins,
}: {
  origins: OriginRow[]
  setOrigins: (rows: OriginRow[]) => void
}) {
  const totalTravelers = origins.reduce((s, r) => s + (r.city ? r.count : 0), 0)
  const validCities = origins.filter((r) => r.city).length

  function update(id: string, patch: Partial<OriginRow>) {
    setOrigins(origins.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function onCityChange(id: string, value: string) {
    const city = findCity(value)
    if (city) {
      update(id, { city: city.city, airport: city.iata, currency: city.currency })
    } else {
      update(id, { city: value, airport: "", currency: "" })
    }
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
            <CardDescription>Where your team is based. Every city is also a candidate destination.</CardDescription>
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
            return (
              <div key={row.id} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    list="city-options"
                    value={row.city}
                    placeholder="City (e.g. Dublin)"
                    aria-label="City"
                    onChange={(e) => onCityChange(row.id, e.target.value)}
                    className="pr-20"
                  />
                  {known && (
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
                      <Badge variant="outline" className="tnums text-[10px]">
                        {row.airport} · {row.currency}
                      </Badge>
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  min={1}
                  value={row.count}
                  aria-label="Number of travelers"
                  onChange={(e) => update(row.id, { count: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-20 tnums"
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
