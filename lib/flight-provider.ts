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
  blockHoursOneWay: number // longest single segment, hours
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
/* Not a pricing engine; used only until a live Amadeus key is added.  */
/* ------------------------------------------------------------------ */

export class FixtureFlightProvider implements FlightProvider {
  readonly name = "fixtures"

  async search(q: SearchQuery): Promise<FlightOffer[]> {
    const o = byIata.get(q.origin)
    const d = byIata.get(q.dest)
    if (!o || !d) return []

    const km = haversineKm(o, d)
    // block hours for a single (longest) segment, ~800 km/h + fixed overhead
    const blockHoursOneWay = Math.round((km / 820 + 1.4) * 10) / 10
    const longHaul = blockHoursOneWay > 8

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
        blockHoursOneWay,
        refundable: v.refundable,
      })
    }
    // Premium economy roughly 2.1x economy, only meaningfully offered on longer routes.
    if (km > 2500) {
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
          blockHoursOneWay,
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
      blockHoursOneWay,
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
/* Amadeus provider — real API, called server-side.                   */
/* ------------------------------------------------------------------ */

interface TokenCache {
  token: string
  expiresAt: number
}
let tokenCache: TokenCache | null = null

export class AmadeusFlightProvider implements FlightProvider {
  readonly name = "amadeus"
  private clientId: string
  private clientSecret: string
  private baseUrl: string

  constructor(clientId: string, clientSecret: string, env: string) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.baseUrl = env === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com"
  }

  private async token(): Promise<string> {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token
    const res = await fetch(`${this.baseUrl}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    })
    if (!res.ok) throw new Error(`Amadeus auth failed: ${res.status}`)
    const json = await res.json()
    tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
    return tokenCache.token
  }

  async search(q: SearchQuery): Promise<FlightOffer[]> {
    const token = await this.token()
    const run = async (nonStop: boolean) => {
      const params = new URLSearchParams({
        originLocationCode: q.origin,
        destinationLocationCode: q.dest,
        departureDate: q.depart,
        returnDate: q.ret,
        adults: "1",
        currencyCode: q.currency,
        max: "20",
      })
      if (nonStop) params.set("nonStop", "true")
      const res = await fetch(`${this.baseUrl}/v2/shopping/flight-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Amadeus search failed: ${res.status}`)
      return res.json()
    }

    let json = await run(q.preferNonstop)
    if (q.preferNonstop && (!json.data || json.data.length === 0)) {
      json = await run(false)
    }
    const data = json.data ?? []
    return data.map((offer: any) => mapAmadeusOffer(offer, q.currency)).filter(Boolean) as FlightOffer[]
  }
}

function isoDurationToHours(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || "")
  if (!m) return 0
  const h = Number(m[1] || 0)
  const min = Number(m[2] || 0)
  return h + min / 60
}

function mapAmadeusOffer(offer: any, currency: string): FlightOffer | null {
  try {
    const cabin = (offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ?? "ECONOMY") as FlightOffer["cabin"]
    const itins = offer.itineraries ?? []
    let maxStops = 0
    let maxSeg = 0
    for (const it of itins) {
      const segs = it.segments ?? []
      maxStops = Math.max(maxStops, segs.length - 1)
      for (const s of segs) maxSeg = Math.max(maxSeg, isoDurationToHours(s.duration))
    }
    const price = Number(offer.price?.grandTotal ?? offer.price?.total ?? 0)
    const refundable = offer.pricingOptions?.refundableFare === true
    return {
      cabin,
      price,
      currency: offer.price?.currency ?? currency,
      stops: maxStops,
      blockHoursOneWay: Math.round(maxSeg * 10) / 10,
      refundable,
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export function getFlightProvider(): { provider: FlightProvider; usingFixtures: boolean } {
  const id = process.env.AMADEUS_CLIENT_ID
  const secret = process.env.AMADEUS_CLIENT_SECRET
  const env = process.env.AMADEUS_ENV ?? "test"
  if (id && secret) {
    return { provider: new AmadeusFlightProvider(id, secret, env), usingFixtures: false }
  }
  return { provider: new FixtureFlightProvider(), usingFixtures: true }
}

export function hasAmadeusKey(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET)
}
