import "server-only"
import fxRates from "@/data/fxRates.json"
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
import {
  type FlightOffer,
  type FlightProvider,
  getFlightProvider,
  ignavApiCallCount,
  providerDegraded,
} from "./flight-provider"
import { primaryAirport } from "./cities"

const FX = fxRates as Record<string, number>

function fxToUsd(currency: string): number {
  return FX[currency] ?? 1
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

// Apply the median-fare ceiling within a single cabin's offers: keep only the
// offers at or below the median price. No-op when the policy is disabled or the
// list is empty.
function applyMedianCeiling(offers: FlightOffer[], policy: PolicyConfig): FlightOffer[] {
  if (!policy.medianCeiling || offers.length === 0) return offers
  const ceil = median(offers.map((o) => o.price))
  const capped = offers.filter((o) => o.price <= ceil)
  return capped.length > 0 ? capped : offers
}

function cheapest(offers: FlightOffer[]): FlightOffer {
  return offers.reduce((a, b) => (b.price < a.price ? b : a))
}

// Price a single (origin -> dest, week). Returns null if unroutable.
function priceRoute(
  offers: FlightOffer[],
  currency: string,
  policy: PolicyConfig,
  advanceWarning: boolean,
): PricedRoute | null {
  if (offers.length === 0) return null
  const threshold = policy.longHaulThresholdHours

  // 1. Establish the baseline itinerary the traveler would actually fly: the
  //    cheapest economy fare (offers are already nonstop-preferred upstream).
  //    Business/first fares are ignored here; economy is the entitlement floor.
  const economyOffers = offers.filter((o) => o.cabin === "ECONOMY")
  const baseOffers = economyOffers.length > 0 ? economyOffers : offers
  const bestEconomy = cheapest(applyMedianCeiling(baseOffers, policy))

  // 2. Long-haul is decided by THIS selected itinerary's longest INDIVIDUAL
  //    segment, never the total trip duration and never some other unselected
  //    routing on the same city pair. This matches the policy: "if any single
  //    leg exceeds the threshold, premium economy is allowed for that route."
  const qualifiesForUpgrade =
    policy.longHaulUpgrade && bestEconomy.longestSegmentHours > threshold

  let best = bestEconomy
  if (qualifiesForUpgrade) {
    // Only consider premium-economy fares that share the qualifying long leg
    // (i.e. the same long-haul routing), so a short connecting premium fare can
    // never be substituted in. If none exist, keep the economy fare — the
    // provider simply had no premium seat for this routing.
    const premiumLongHaul = offers.filter(
      (o) => o.cabin === "PREMIUM_ECONOMY" && o.longestSegmentHours > threshold,
    )
    if (premiumLongHaul.length > 0) {
      best = cheapest(applyMedianCeiling(premiumLongHaul, policy))
    }
  }

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

  // Only cities flagged as able to host an onsite are scored as destinations.
  // Every city still contributes travelers (i.e. remains a possible origin).
  const hostCities = origins.filter((o) => o.canHost !== false)
  // When a city is a destination, travelers always arrive at its PRIMARY
  // airport, independent of which airport that city's own team departs from.
  const destAirportFor = (row: OriginRow) => primaryAirport(row.city) ?? row.airport
  const destinations = hostCities.map((o) => o.city)
  const cache = new Map<string, FlightOffer[]>()

  // Build the ordered list of origin->dest lookups (per week, skipping same-city)
  // up front so the UI can render the full plan before any pricing happens. This
  // matches the iteration order of the pricing loops below exactly.
  const plannedRouteList: PlannedRoute[] = []
  for (const w of weeks) {
    for (const dest of hostCities) {
      for (const origin of origins) {
        if (origin.city === dest.city) continue
        plannedRouteList.push({
          origin: origin.city,
          originAirport: origin.airport,
          destination: dest.city,
          destAirport: destAirportFor(dest),
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
      longHaulUpgrade: policy.longHaulUpgrade,
      longHaulThresholdHours: policy.longHaulThresholdHours,
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
    for (const dest of hostCities) {
      const destAirport = destAirportFor(dest)
      const byOrigin: OriginBreakdown[] = []
      const unroutable: string[] = []
      let totalUsd = 0

      for (const origin of origins) {
        if (origin.city === dest.city) continue // already based there -> $0
        routeIndex++
        const cached = cache.has(
          `${origin.airport}-${destAirport}-${w.depart}-${w.return}-${policy.preferNonstop}-${policy.excludeRefundable}-${origin.currency}`,
        )
        onProgress?.({
          type: "route",
          index: routeIndex,
          status: "fetching",
          origin: origin.city,
          originAirport: origin.airport,
          destination: dest.city,
          destAirport,
          weekId: w.id,
          weekLabel: w.label,
          cached,
        })
        const offers = await search(origin.airport, destAirport, w, origin.currency)
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
          destAirport,
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
          longHaul: priced.longestSegmentHours > policy.longHaulThresholdHours,
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
  const elapsedMs = Date.now() - runStart
  const ignavCalls = ignavApiCallCount(provider)
  const routableCombos = totals.filter((t) => t.byOrigin.length > 0).length
  const unroutableOriginLegs = totals.reduce((n, t) => n + t.unroutable.length, 0)

  // End-of-search summary. searchCount is logical route lookups (one per
  // origin->dest/week pair after the cache); ignavCalls is the true number of
  // HTTP POSTs to the Ignav API, which is higher because each lookup can fetch
  // economy + premium economy (+ nonstop-relax retries).
  console.log("[v0] ===== search summary =====")
  console.log(
    `[v0] summary | provider=${provider.name} | mode=${
      usingFixtures ? "fixtures" : degraded ? "live->fixtures (degraded)" : "live"
    } | elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
  )
  console.log(
    `[v0] summary | inputs: ${origins.length} cities x ${weeks.length} weeks = ${totals.length} city/week combos evaluated`,
  )
  console.log(
    `[v0] summary | lookups: ${searchCount} live route lookups, ${cacheHits} cache hits (${
      searchCount + cacheHits
    } total, ${plannedRoutes} planned)`,
  )
  console.log(
    `[v0] summary | Ignav API calls: ${
      ignavCalls === null ? "0 (no live API used)" : ignavCalls
    }`,
  )
  console.log(
    `[v0] summary | coverage: ${routableCombos}/${totals.length} combos routable, ${unroutableOriginLegs} unroutable origin legs`,
  )
  if (winner) {
    console.log(
      `[v0] summary | winner: ${winner.destination} @ $${winner.totalUsd.toLocaleString()} (week ${winner.weekId})`,
    )
  } else {
    console.log(`[v0] summary | winner: none (no routable city/week combinations found)`)
  }
  console.log("[v0] ===========================")

  return {
    totals,
    weeks,
    destinations,
    // Either we never had a key, or the live API was unreachable and we fell back.
    usingFixtures: usingFixtures || degraded,
    generatedAt: new Date().toISOString(),
  }
}
