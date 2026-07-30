import citiesData from "@/data/cities.json"
import type { Airport, City } from "./types"

export const CITIES = citiesData as City[]

export function findCity(name: string): City | undefined {
  return CITIES.find((c) => c.city.toLowerCase() === name.toLowerCase())
}

// The selectable airports for a city. Cities without an explicit `airports`
// list resolve to a single-entry list built from their primary airport, so
// callers can treat every city uniformly.
export function airportsFor(name: string): Airport[] {
  const c = findCity(name)
  if (!c) return []
  if (c.airports && c.airports.length > 0) return c.airports
  return [{ iata: c.iata, name: c.city, lat: c.lat, lng: c.lng }]
}

// The primary (default) airport IATA for a city — used when the city is a
// destination, regardless of which airport its travelers depart from.
export function primaryAirport(name: string): string | undefined {
  return findCity(name)?.iata
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0)
    return parts.find((p) => p.type === "currency")?.value ?? currency
  } catch {
    return currency
  }
}
