"use server"

import { runSearch } from "@/lib/algorithm"
import { hasIgnavKey } from "@/lib/flight-provider"
import type { OriginRow, PolicyConfig, SearchResult, Week } from "@/lib/types"

export async function searchOnsite(input: {
  origins: OriginRow[]
  weeks: Week[]
  policy: PolicyConfig
}): Promise<SearchResult> {
  const { origins, weeks, policy } = input
  console.log(
    `[v0] searchOnsite called | cities=${origins.length} weeks=${weeks.length} | hasIgnavKey=${hasIgnavKey()}`,
  )
  console.log(
    `[v0] cities: ${origins.map((o) => `${o.city}(${o.airport}, x${o.count}, ${o.currency})`).join(", ")}`,
  )
  console.log(`[v0] weeks: ${weeks.map((w) => `${w.depart}->${w.return}`).join(", ")}`)
  console.log(
    `[v0] policy: nonstop=${policy.preferNonstop} excludeRefundable=${policy.excludeRefundable} upgrade=${policy.longHaulUpgrade} medianCeiling=${policy.medianCeiling}`,
  )

  if (origins.length < 2) throw new Error("At least two cities are required.")
  if (weeks.length < 1) throw new Error("At least one week is required.")

  const started = Date.now()
  try {
    const result = await runSearch(origins, weeks, policy)
    console.log(
      `[v0] searchOnsite done in ${Date.now() - started}ms | ${result.totals.length} city/week totals | usingFixtures=${result.usingFixtures}`,
    )
    return result
  } catch (err) {
    console.log(`[v0] searchOnsite FAILED after ${Date.now() - started}ms:`, (err as Error)?.message)
    throw err
  }
}

export async function getKeyStatus(): Promise<{ hasKey: boolean }> {
  return { hasKey: hasIgnavKey() }
}
