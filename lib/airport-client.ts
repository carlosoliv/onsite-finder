"use client"

import type { AirportSuggestion } from "./types"

// Simple in-memory cache of query -> results for the session, as recommended by
// the Ignav docs (debounce + cache repeated autocomplete queries).
const cache = new Map<string, AirportSuggestion[]>()

// Fetch airport suggestions from our server proxy. Returns [] for short queries
// or when the lookup is disabled (no API key). Safe to call on every keystroke;
// callers should still debounce to limit requests.
export async function fetchAirportSuggestions(q: string, signal?: AbortSignal): Promise<AirportSuggestion[]> {
  const key = q.trim().toLowerCase()
  if (key.length < 2) return []
  const cached = cache.get(key)
  if (cached) return cached

  const res = await fetch(`/api/airports?q=${encodeURIComponent(key)}&limit=8`, { signal })
  if (!res.ok) return []
  const json = (await res.json()) as { enabled?: boolean; results?: AirportSuggestion[] }
  const results = Array.isArray(json.results) ? json.results : []
  cache.set(key, results)
  return results
}
