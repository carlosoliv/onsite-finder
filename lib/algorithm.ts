import "server-only"
import fxRates from "@/data/fxRates.json"
import { RANK } from "./policy"
import type { Cabin, CityWeekTotal, OriginBreakdown, OriginRow, PolicyConfig, SearchResult, Week } from "./types"
import { type FlightOffer, type FlightProvider, getFlightProvider, providerDegraded } from "./flight-provider"

const FX = fxRates as Record<string, number>

function fxToUsd(currency: string): number {
  return FX[currency] ?? 1
}

function allowedCabin(offers: FlightOffer[], policy: PolicyConfig): Cabin {
  if (!policy.longHaulUpgrade) return "ECONOMY"
  const longLeg = offers.some((o) => o.blockHoursOneWay > policy.longHaulThresholdHours)
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
  blockHoursOneWay: number
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
    blockHoursOneWay: best.blockHoursOneWay,
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
  providerOverride?: FlightProvider,
): Promise<SearchResult> {
  const { provider, usingFixtures } = providerOverride
    ? { provider: providerOverride, usingFixtures: providerOverride.name === "fixtures" }
    : getFlightProvider()

  const destinations = origins.map((o) => o.city)
  const cache = new Map<string, FlightOffer[]>()

  const search = async (originAirport: string, destAirport: string, w: Week, currency: string) => {
    const key = `${originAirport}-${destAirport}-${w.depart}-${w.return}-${policy.preferNonstop}-${policy.excludeRefundable}-${currency}`
    if (cache.has(key)) return cache.get(key)!
    const offers = await provider.search({
      origin: originAirport,
      dest: destAirport,
      depart: w.depart,
      ret: w.return,
      currency,
      preferNonstop: policy.preferNonstop,
      excludeRefundable: policy.excludeRefundable,
    })
    cache.set(key, offers)
    return offers
  }

  const totals: CityWeekTotal[] = []

  for (const w of weeks) {
    const advanceWarning = daysUntil(w.depart) < policy.advancePurchaseDays
    for (const dest of origins) {
      const byOrigin: OriginBreakdown[] = []
      const unroutable: string[] = []
      let totalUsd = 0

      for (const origin of origins) {
        if (origin.city === dest.city) continue // already based there -> $0
        const offers = await search(origin.airport, dest.airport, w, origin.currency)
        const priced = priceRoute(offers, origin.currency, policy, advanceWarning)
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

  return {
    totals,
    weeks,
    destinations,
    // Either we never had a key, or the live API was unreachable and we fell back.
    usingFixtures: usingFixtures || providerDegraded(provider),
    generatedAt: new Date().toISOString(),
  }
}
