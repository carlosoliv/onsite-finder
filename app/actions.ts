"use server"

import { runSearch } from "@/lib/algorithm"
import { hasAmadeusKey } from "@/lib/flight-provider"
import type { OriginRow, PolicyConfig, SearchResult, Week } from "@/lib/types"

export async function searchOnsite(input: {
  origins: OriginRow[]
  weeks: Week[]
  policy: PolicyConfig
}): Promise<SearchResult> {
  const { origins, weeks, policy } = input
  if (origins.length < 2) throw new Error("At least two cities are required.")
  if (weeks.length < 1) throw new Error("At least one week is required.")
  return runSearch(origins, weeks, policy)
}

export async function getKeyStatus(): Promise<{ hasKey: boolean }> {
  return { hasKey: hasAmadeusKey() }
}
