import "server-only"
import citiesData from "@/data/cities.json"
import type { City } from "./types"

const CITIES = citiesData as City[]
const byIata = new Map(CITIES.map((c) => [c.iata, c]))

export interface FlightOffer {
  cabin: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"
  price: number // native currency (origin currency)
  currency: string
  stops: number
  longestSegmentHours: number // longest single segment, hours
  refundable: boolean
}

export interface SearchQuery {
  origin: string // IATA
  dest: string // IATA
  depart: string // ISO date
  ret: string // ISO date
  currency: string // origin currency
  preferNonstop: boolean
  excludeRefundable: boolean
  // Upgrade policy, threaded from PolicyConfig so the provider only spends an
  // extra request on (or synthesizes) premium economy when policy allows it.
  longHaulUpgrade: boolean
  longHaulThresholdHours: number
}

export interface FlightProvider {
  readonly name: string
  search(q: SearchQuery): Promise<FlightOffer[]>
}

/* ------------------------------------------------------------------ */
/* Geo helpers                                                         */
/* ------------------------------------------------------------------ */

function haversineKm(a: City, b: City): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Deterministic pseudo-random in [0,1) from a string seed.
function seeded(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/* ------------------------------------------------------------------ */
/* Fixture provider — deterministic synthetic offers for UI/dev work.  */
/* Not a pricing engine; used only until a live Ignav key is added.   */
/* ------------------------------------------------------------------ */

export class FixtureFlightProvider implements FlightProvider {
  readonly name = "fixtures"

  async search(q: SearchQuery): Promise<FlightOffer[]> {
    const o = byIata.get(q.origin)
    const d = byIata.get(q.dest)
    if (!o || !d) return []

    const km = haversineKm(o, d)
    // block hours for a single (longest) segment, ~800 km/h + fixed overhead
    const longestSegmentHours = Math.round((km / 820 + 1.4) * 10) / 10
    const longHaul = longestSegmentHours > 8

    // USD baseline fare then convert to origin currency at the end of algorithm.
    // Here we price directly in the origin currency for realism.
    const rng = seeded(`${q.origin}-${q.dest}-${q.depart}`)
    const baseUsd = 60 + km * (longHaul ? 0.11 : 0.16) + rng * 120

    // Offers vary so median-ceiling and nonstop logic have something to chew on.
    const offers: FlightOffer[] = []
    const fx = FX[q.currency] ?? 1
    const toNative = (usd: number) => Math.round((usd / fx) * 100) / 100

    const variants = [
      { mult: 0.92, stops: longHaul ? 1 : 0, refundable: false },
      { mult: 1.0, stops: 0, refundable: false },
      { mult: 1.18, stops: 0, refundable: false },
      { mult: 1.05, stops: 1, refundable: false },
      { mult: 1.55, stops: 0, refundable: true },
    ]
    for (const v of variants) {
      offers.push({
        cabin: "ECONOMY",
        price: toNative(baseUsd * v.mult),
        currency: q.currency,
        stops: v.stops,
        longestSegmentHours,
        refundable: v.refundable,
      })
    }
    // Premium economy roughly 2.1x economy. Mirror the live provider: only
    // synthesize these offers when the upgrade policy is enabled and the
    // longest segment crosses the policy threshold, so the cabin exists exactly
    // when policy could allow it.
    if (q.longHaulUpgrade && longestSegmentHours > q.longHaulThresholdHours) {
      for (const v of [
        { mult: 2.0, stops: longHaul ? 1 : 0, refundable: false },
        { mult: 2.3, stops: 0, refundable: false },
        { mult: 2.9, stops: 0, refundable: true },
      ]) {
        offers.push({
          cabin: "PREMIUM_ECONOMY",
          price: toNative(baseUsd * v.mult),
          currency: q.currency,
          stops: v.stops,
          longestSegmentHours,
          refundable: v.refundable,
        })
      }
    }
    // Add a business fare to prove the cap works (never selected).
    offers.push({
      cabin: "BUSINESS",
      price: toNative(baseUsd * 4.5),
      currency: q.currency,
      stops: 0,
      longestSegmentHours,
      refundable: true,
    })

    let result = offers
    if (q.preferNonstop) {
      const nonstop = result.filter((f) => f.stops === 0)
      if (nonstop.length > 0) result = nonstop
    }
    if (q.excludeRefundable) {
      const nonRef = result.filter((f) => !f.refundable)
      if (nonRef.length > 0) result = nonRef
    }
    return result
  }
}

// Local FX table (mirror of data/fxRates.json) used only to price fixtures
// in the origin currency. Real provider returns native currency directly.
const FX: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  SGD: 0.74,
  JPY: 0.0064,
  AUD: 0.66,
  INR: 0.012,
  BRL: 0.18,
  AED: 0.27,
}

/* ------------------------------------------------------------------ */
/* Ignav provider — real API, called server-side.                     */
/* Docs: https://ignav.com/docs   (base https://ignav.com/api)         */
/* Auth: X-Api-Key header. Round-trip fares via POST /fares/round-trip.*/
/* ------------------------------------------------------------------ */

const IGNAV_BASE = "https://ignav.com/api"

// Ignav uses a 2-letter market (country) code to decide currency + locale.
// Map each origin currency to a representative market, then normalize the
// returned fare back into the origin currency below.
const CURRENCY_TO_MARKET: Record<string, string> = {
  USD: "US",
  EUR: "DE",
  GBP: "GB",
  CAD: "CA",
  SGD: "SG",
  JPY: "JP",
  AUD: "AU",
  INR: "IN",
  BRL: "BR",
  AED: "AE",
}

type IgnavCabin = "economy" | "premium_economy" | "business" | "first"

const CABIN_FROM_IGNAV: Record<string, FlightOffer["cabin"]> = {
  economy: "ECONOMY",
  premium_economy: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST",
}

export class IgnavFlightProvider implements FlightProvider {
  readonly name = "ignav"
  private apiKey: string
  // Number of actual HTTP POSTs made to the Ignav API over this provider's
  // lifetime. A single search() can trigger several (economy, premium economy,
  // and nonstop-relax retries), so this is the true API-call count.
  apiCallCount = 0

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async roundTrip(body: Record<string, unknown>): Promise<any> {
    this.apiCallCount++
    const label = `${body.origin}->${body.destination} ${body.cabin_class} ${body.departure_date}`
    console.log(`[v0] ignav POST /fares/round-trip | ${label}`)
    const t0 = Date.now()
    let res: Response
    try {
      res = await fetch(`${IGNAV_BASE}/fares/round-trip`, {
        method: "POST",
        headers: {
          "X-Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      // Network-level failure (DNS, timeout, connection refused).
      console.log(`[v0] ignav NETWORK ERROR after ${Date.now() - t0}ms | ${label} |`, (err as Error)?.message)
      throw err
    }
    const ms = Date.now() - t0
    if (!res.ok) {
      let detail = ""
      try {
        const j = await res.json()
        detail = j?.error?.message ?? ""
      } catch {
        // non-JSON error body; ignore
      }
      console.log(`[v0] ignav HTTP ${res.status} after ${ms}ms | ${label} | ${detail}`)
      throw new Error(`Ignav search failed: ${res.status}${detail ? ` ${detail}` : ""}`)
    }
    const json = await res.json()
    console.log(`[v0] ignav 200 in ${ms}ms | ${label} | ${json?.itineraries?.length ?? 0} itineraries`)
    return json
  }

  async search(q: SearchQuery): Promise<FlightOffer[]> {
    const market = CURRENCY_TO_MARKET[q.currency] ?? "US"
    const base = {
      origin: q.origin,
      destination: q.dest,
      departure_date: q.depart,
      return_date: q.ret,
      adults: 1,
      market,
    }

    const runCabin = async (cabin: IgnavCabin): Promise<any[]> => {
      const body: Record<string, unknown> = { ...base, cabin_class: cabin }
      if (q.preferNonstop) body.max_stops = 0
      let json = await this.roundTrip(body)
      let itineraries: any[] = json.itineraries ?? []
      // Nonstop can return nothing on some routes; relax the filter and retry.
      if (q.preferNonstop && itineraries.length === 0) {
        delete body.max_stops
        json = await this.roundTrip(body)
        itineraries = json.itineraries ?? []
      }
      return itineraries
    }

    const economy = await runCabin("economy")
    // The cabin is authoritative from the endpoint we queried, not from the
    // itinerary payload: Ignav does not reliably echo cabin_class per itinerary,
    // so trusting the response would mislabel premium-economy fares as economy.
    const offers = economy
      .map((it) => mapIgnavItinerary(it, q.currency, "ECONOMY"))
      .filter(Boolean) as FlightOffer[]

    // Only spend an extra request on premium economy when the upgrade policy is
    // enabled AND the route's longest segment actually crosses the policy
    // threshold. Checking the economy results first means we fetch premium
    // economy exactly for the routes that could be allowed to use it.
    const longHaul =
      q.longHaulUpgrade && offers.some((o) => o.longestSegmentHours > q.longHaulThresholdHours)
    if (longHaul) {
      const premium = await runCabin("premium_economy")
      for (const it of premium) {
        const m = mapIgnavItinerary(it, q.currency, "PREMIUM_ECONOMY")
        if (m) offers.push(m)
      }
    }

    let result = offers
    if (q.excludeRefundable) {
      const nonRef = result.filter((f) => !f.refundable)
      if (nonRef.length > 0) result = nonRef
    }
    return result
  }
}

function ignavLegStops(leg: any): number {
  const segs = leg?.segments ?? []
  return Math.max(0, segs.length - 1)
}

// Longest single segment (in hours) within a leg, falling back to the leg total.
function ignavLegLongestSegmentHours(leg: any): number {
  const segs = leg?.segments ?? []
  let maxMin = 0
  for (const s of segs) {
    const d = Number(s?.duration_minutes ?? 0)
    if (d > maxMin) maxMin = d
  }
  if (maxMin === 0) maxMin = Number(leg?.duration_minutes ?? 0)
  return maxMin / 60
}

function mapIgnavItinerary(
  it: any,
  expectedCurrency: string,
  // The cabin we requested from the API. Ignav does not reliably return
  // cabin_class per itinerary, so the requested cabin is authoritative; we only
  // fall back to the response field when no forced cabin is supplied.
  forcedCabin?: FlightOffer["cabin"],
): FlightOffer | null {
  try {
    const cabin = forcedCabin ?? CABIN_FROM_IGNAV[String(it.cabin_class ?? "economy")] ?? "ECONOMY"
    const legs = [it.outbound, it.inbound].filter(Boolean)
    if (legs.length === 0) return null
    let stops = 0
    let longestSegmentHours = 0
    for (const leg of legs) {
      stops = Math.max(stops, ignavLegStops(leg))
      longestSegmentHours = Math.max(longestSegmentHours, ignavLegLongestSegmentHours(leg))
    }
    const amount = Number(it.price?.amount ?? 0)
    const responseCurrency = String(it.price?.currency ?? expectedCurrency)
    const price = convertCurrency(amount, responseCurrency, expectedCurrency)
    return {
      cabin,
      price: Math.round(price * 100) / 100,
      currency: expectedCurrency,
      stops,
      longestSegmentHours: Math.round(longestSegmentHours * 10) / 10,
      // Ignav does not expose refundability; published fares are treated as non-refundable.
      refundable: false,
    }
  } catch {
    return null
  }
}

// Convert an amount between currencies using the local USD-multiplier FX table.
function convertCurrency(amount: number, from: string, to: string): number {
  if (from === to) return amount
  const fromUsd = FX[from] ?? 1
  const toUsd = FX[to] ?? 1
  return (amount * fromUsd) / toUsd
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

/**
 * Wraps a live provider so that any network/API failure transparently falls
 * back to deterministic fixtures instead of crashing the whole search. This
 * keeps the app usable in environments without outbound network access to the
 * flight API (e.g. sandboxes) while still preferring real data when reachable.
 */
class ResilientFlightProvider implements FlightProvider {
  readonly name: string
  private live: FlightProvider
  private fallback: FixtureFlightProvider
  // Once the live API is proven unreachable, stop retrying for this request cycle.
  private liveDown = false

  constructor(live: FlightProvider) {
    this.live = live
    this.fallback = new FixtureFlightProvider()
    this.name = live.name
  }

  get degraded(): boolean {
    return this.liveDown
  }

  // Surface the underlying live provider so callers can read provider-specific
  // metrics (e.g. Ignav's HTTP call count) without knowing the wrapper exists.
  get liveProvider(): FlightProvider {
    return this.live
  }

  static is(p: unknown): p is ResilientFlightProvider {
    return p instanceof ResilientFlightProvider
  }

  async search(q: SearchQuery): Promise<FlightOffer[]> {
    if (this.liveDown) {
      // Already degraded earlier this run; skip the live call entirely.
      return this.fallback.search(q)
    }
    try {
      return await this.live.search(q)
    } catch (err) {
      this.liveDown = true
      console.log(
        `[v0] live provider "${this.live.name}" FAILED, falling back to fixtures for the rest of this run:`,
        (err as Error)?.message,
      )
      return this.fallback.search(q)
    }
  }
}

export function getFlightProvider(): { provider: FlightProvider; usingFixtures: boolean } {
  const apiKey = process.env.IGNAV_API_KEY
  if (apiKey) {
    return { provider: new ResilientFlightProvider(new IgnavFlightProvider(apiKey)), usingFixtures: false }
  }
  return { provider: new FixtureFlightProvider(), usingFixtures: true }
}

export function hasIgnavKey(): boolean {
  return Boolean(process.env.IGNAV_API_KEY)
}

// True if a resilient provider fell back to fixtures during the run.
export function providerDegraded(p: FlightProvider): boolean {
  return ResilientFlightProvider.is(p) && p.degraded
}

// Number of real HTTP calls made to the Ignav API by this provider, or null
// when no Ignav provider is involved (e.g. pure fixtures). Unwraps the
// resilient wrapper if present.
export function ignavApiCallCount(p: FlightProvider): number | null {
  const target = ResilientFlightProvider.is(p) ? p.liveProvider : p
  return target instanceof IgnavFlightProvider ? target.apiCallCount : null
}
