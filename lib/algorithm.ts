import "server-only"
import fxRates from "@/data/fxRates.json"
import { RANK } from "./policy"
import type {
  Cabin,
  CityWeekTotal,
  OriginBreakdown,
  OriginRow,
  PlannedRoute,
  PolicyConfig,
  SearchProgressEvent,
  SearchResult,
  Week,
} from "./types"
import { type FlightOffer, type FlightProvider, getFlightProvider, providerDegraded } from "./flight-provider"

const FX = fxRates as Record<string, number>

function fxToUsd(currency: string): number {
  return FX[currency] ?? 1
}

function allowedCabin(offers: FlightOffer[], policy: PolicyConfig): Cabin {
  if (!policy.longHaulUpgrade) return "ECONOMY"
  const longLeg = offers.some((o) => o.longestSegmentHours > policy.longHaulThresholdHours)
  return longLeg ? "PREMIUM_ECONOMY" : "ECONOMY"
}

function median(nums: number[]): number {
  if (nums.length === 0) return Number.POSITIVE_INFINITY
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

interface PricedRoute {
  cabin: Cabin
  stops: number
  longestSegmentHours: number
  nativePrice: number
  nativeCurrency: string
  usdEach: number
  flags: string[]
}

// Price a single (origin -> dest, week). Returns null if unroutable.
function priceRoute(
  offers: FlightOffer[],
  currency: string,
  policy: PolicyConfig,
  advanceWarning: boolean,
): PricedRoute | null {
  if (offers.length === 0) return null

  // Cabins we're allowed to consider. allowedCabin never returns above premium
  // economy, and RANK only maps economy/premium economy, so business/first are
  // always excluded (capPremiumEconomy is enforced by construction).
  const cap = allowedCabin(offers, policy)
  const capRank = RANK[cap]

  let eligible = offers.filter((o) => {
    const r = RANK[o.cabin as Cabin]
    return r !== undefined && r <= capRank
  })
  if (eligible.length === 0) {
    // Fall back to economy-only if the allowed cabin had no offers.
    eligible = offers.filter((o) => o.cabin === "ECONOMY")
  }
  if (eligible.length === 0) return null

  // Median fare ceiling within the chosen cap cabin.
  if (policy.medianCeiling) {
    const capCabinPrices = eligible.filter((o) => o.cabin === cap).map((o) => o.price)
    const ceil = median(capCabinPrices.length ? capCabinPrices : eligible.map((o) => o.price))
    const capped = eligible.filter((o) => o.price <= ceil)
    if (capped.length > 0) eligible = capped
  }

  const best = eligible.reduce((a, b) => (b.price < a.price ? b : a))

  const flags: string[] = []
  if (best.stops === 0) flags.push("nonstop")
  else flags.push(`${best.stops} stop`)
  if (advanceWarning) flags.push("advance-purchase-warning")

  let usdNative = best.price
  // fees are quoted in USD in policy; convert into native then re-convert, but simpler:
  // add fees in USD after conversion.
  let usdEach = usdNative * fxToUsd(currency)
  if (policy.includeCheckedBag) {
    usdEach += policy.checkedBagFeeUsd
    flags.push("+bag")
  }
  if (policy.includeSeatSelection) {
    usdEach += policy.seatSelectionFeeUsd
    flags.push("+seat")
  }

  return {
    cabin: best.cabin as Cabin,
    stops: best.stops,
    longestSegmentHours: best.longestSegmentHours,
    nativePrice: Math.round(best.price * 100) / 100,
    nativeCurrency: currency,
    usdEach: Math.round(usdEach),
    flags,
  }
}

function daysUntil(dateIso: string): number {
  const now = new Date()
  const d = new Date(dateIso + "T00:00:00")
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export async function runSearch(
  origins: OriginRow[],
  weeks: Week[],
  policy: PolicyConfig,
  options?: {
    providerOverride?: FlightProvider
    onProgress?: (event: SearchProgressEvent) => void
  },
): Promise<SearchResult> {
  const providerOverride = options?.providerOverride
  const onProgress = options?.onProgress
  const { provider, usingFixtures } = providerOverride
    ? { provider: providerOverride, usingFixtures: providerOverride.name === "fixtures" }
    : getFlightProvider()

  const destinations = origins.map((o) => o.city)
  const cache = new Map<string, FlightOffer[]>()

  // Build the ordered list of origin->dest lookups (per week, skipping same-city)
  // up front so the UI can render the full plan before any pricing happens. This
  // matches the iteration order of the pricing loops below exactly.
  const plannedRouteList: PlannedRoute[] = []
  for (const w of weeks) {
    for (const dest of origins) {
      for (const origin of origins) {
        if (origin.city === dest.city) continue
        plannedRouteList.push({
          origin: origin.city,
          originAirport: origin.airport,
          destination: dest.city,
          destAirport: dest.airport,
          weekId: w.id,
          weekLabel: w.label,
        })
      }
    }
  }
  const plannedRoutes = plannedRouteList.length
  console.log(
    `[v0] runSearch start | provider=${provider.name} usingFixtures=${usingFixtures} | up to ${plannedRoutes} route lookups (before cache)`,
  )
  onProgress?.({ type: "start", total: plannedRoutes, routes: plannedRouteList })
  const runStart = Date.now()
  let searchCount = 0
  let cacheHits = 0

  const search = async (originAirport: string, destAirport: string, w: Week, currency: string) => {
    const key = `${originAirport}-${destAirport}-${w.depart}-${w.return}-${policy.preferNonstop}-${policy.excludeRefundable}-${currency}`
    if (cache.has(key)) {
      cacheHits++
      console.log(`[v0] cache hit ${originAirport}->${destAirport} ${w.depart} (${cacheHits} hits so far)`)
      return cache.get(key)!
    }
    searchCount++
    const n = searchCount
    console.log(`[v0] [${n}] fetch ${originAirport}->${destAirport} ${w.depart}..${w.return} (${currency})`)
    const t0 = Date.now()
    const offers = await provider.search({
      origin: originAirport,
      dest: destAirport,
      depart: w.depart,
      ret: w.return,
      currency,
      preferNonstop: policy.preferNonstop,
      excludeRefundable: policy.excludeRefundable,
    })
    console.log(`[v0] [${n}] done ${originAirport}->${destAirport} in ${Date.now() - t0}ms | ${offers.length} offers`)
    cache.set(key, offers)
    return offers
  }

  const totals: CityWeekTotal[] = []
  let routeIndex = 0

  for (let wi = 0; wi < weeks.length; wi++) {
    const w = weeks[wi]
    console.log(`[v0] === week ${wi + 1}/${weeks.length} (${w.depart}) | ${Date.now() - runStart}ms elapsed ===`)
    const advanceWarning = daysUntil(w.depart) < policy.advancePurchaseDays
    for (const dest of origins) {
      const byOrigin: OriginBreakdown[] = []
      const unroutable: string[] = []
      let totalUsd = 0

      for (const origin of origins) {
        if (origin.city === dest.city) continue // already based there -> $0
        routeIndex++
        const cached = cache.has(
          `${origin.airport}-${dest.airport}-${w.depart}-${w.return}-${policy.preferNonstop}-${policy.excludeRefundable}-${origin.currency}`,
        )
        onProgress?.({
          type: "route",
          index: routeIndex,
          status: "fetching",
          origin: origin.city,
          originAirport: origin.airport,
          destination: dest.city,
          destAirport: dest.airport,
          weekId: w.id,
          weekLabel: w.label,
          cached,
        })
        const offers = await search(origin.airport, dest.airport, w, origin.currency)
        // In demo/fixture mode lookups resolve instantly; add a small pause so the
        // live progress feed is actually perceivable. No effect on the live API path.
        if (usingFixtures && !cached) await new Promise((r) => setTimeout(r, 70))
        const priced = priceRoute(offers, origin.currency, policy, advanceWarning)
        onProgress?.({
          type: "route",
          index: routeIndex,
          status: "done",
          origin: origin.city,
          originAirport: origin.airport,
          destination: dest.city,
          destAirport: dest.airport,
          weekId: w.id,
          weekLabel: w.label,
          cached,
          offers: offers.length,
          routable: Boolean(priced),
          cheapestUsdEach: priced ? priced.usdEach : null,
        })
        if (!priced) {
          unroutable.push(origin.city)
          continue
        }
        const usdSubtotal = priced.usdEach * origin.count
        totalUsd += usdSubtotal
        byOrigin.push({
          origin: origin.city,
          count: origin.count,
          cabin: priced.cabin,
          usdEach: priced.usdEach,
          usdSubtotal,
          stops: priced.stops,
          nativePrice: priced.nativePrice,
          nativeCurrency: priced.nativeCurrency,
          flags: priced.flags,
        })
      }

      totals.push({
        destination: dest.city,
        weekId: w.id,
        totalUsd: Math.round(totalUsd),
        byOrigin: byOrigin.sort((a, b) => b.usdSubtotal - a.usdSubtotal),
        unroutable,
      })
    }
  }

  totals.sort((a, b) => a.totalUsd - b.totalUsd)

  const degraded = providerDegraded(provider)
  const winner = totals[0]
  console.log(
    `[v0] runSearch complete in ${Date.now() - runStart}ms | ${searchCount} live lookups, ${cacheHits} cache hits | degraded=${degraded}`,
  )
  if (winner) {
    console.log(
      `[v0] winner: ${winner.destination} @ $${winner.totalUsd.toLocaleString()} (week ${winner.weekId})`,
    )
  } else {
    console.log(`[v0] no routable city/week combinations found`)
  }

  return {
    totals,
    weeks,
    destinations,
    // Either we never had a key, or the live API was unreachable and we fell back.
    usingFixtures: usingFixtures || degraded,
    generatedAt: new Date().toISOString(),
  }
}
