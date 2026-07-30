import type { ResolvedCity } from "./types"

// Ask the server to resolve a free-typed city name into a routable city
// (airport, currency, coordinates). Returns null when the city can't be found.
export async function resolveCity(query: string, signal?: AbortSignal): Promise<ResolvedCity | null> {
  const res = await fetch("/api/resolve-city", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  })

  if (!res.ok) {
    throw new Error(`City search failed (${res.status})`)
  }

  const data = (await res.json()) as Partial<ResolvedCity>
  if (!data.found || !data.iata) return null
  return data as ResolvedCity
}
