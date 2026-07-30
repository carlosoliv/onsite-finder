export interface City {
  city: string
  iata: string
  country: string
  currency: string
  lat: number
  lng: number
}

export interface OriginRow {
  id: string
  city: string // display name, e.g. "Dublin"
  airport: string // IATA, e.g. "DUB"
  currency: string // ISO 4217 of the origin, e.g. "EUR"
  count: number // number of travelers based in this city
  // Geo coordinates for the origin's primary airport. Present for cities in our
  // built-in list and for cities resolved on the fly via the city resolver.
  // Threaded to the pricing engine so resolved cities are routable in fixtures.
  lat?: number
  lng?: number
  country?: string // ISO 3166-1 alpha-2, e.g. "IE"
  resolved?: boolean // true when this city was resolved by the AI city search
}

// Result of resolving a free-typed city name into a routable city.
export interface ResolvedCity {
  found: boolean
  city: string
  iata: string
  country: string
  currency: string
  lat: number
  lng: number
}

export interface Week {
  id: string
  label: string // e.g. "Mon Nov 2 - Fri Nov 6"
  depart: string // ISO date (first day)
  return: string // ISO date (last day)
}

export interface PolicyConfig {
  longHaulUpgrade: boolean
  longHaulThresholdHours: number
  capPremiumEconomy: boolean
  advancePurchaseDays: number
  preferNonstop: boolean
  excludeRefundable: boolean
  medianCeiling: boolean
  includeCheckedBag: boolean
  includeSeatSelection: boolean
  checkedBagFeeUsd: number
  seatSelectionFeeUsd: number
}

export type Cabin = "ECONOMY" | "PREMIUM_ECONOMY"

export interface FareResult {
  origin: string
  destination: string
  weekId: string
  cabin: Cabin
  stops: number
  longestSegmentHours: number
  nativePrice: number
  nativeCurrency: string
  usdPrice: number
  fxRate: number
  inPolicy: boolean
  flags: string[]
}

export interface OriginBreakdown {
  origin: string
  count: number
  cabin: Cabin
  usdEach: number
  usdSubtotal: number
  stops: number
  nativePrice: number
  nativeCurrency: string
  flags: string[]
  longHaul: boolean // longest segment exceeds the policy long-haul threshold
}

export interface CityWeekTotal {
  destination: string
  weekId: string
  totalUsd: number
  byOrigin: OriginBreakdown[]
  unroutable: string[]
}

export interface SearchInput {
  origins: OriginRow[]
  weeks: Week[]
  policy: PolicyConfig
}

export interface SearchResult {
  totals: CityWeekTotal[] // ranked ascending by totalUsd
  weeks: Week[]
  destinations: string[]
  usingFixtures: boolean
  generatedAt: string
}

// A single origin->destination lookup for a given week that the search will price.
export interface PlannedRoute {
  origin: string
  originAirport: string
  destination: string
  destAirport: string
  weekId: string
  weekLabel: string
}

// Streamed while a search runs so the UI can show progress in real time.
export type SearchProgressEvent =
  | { type: "start"; total: number; routes: PlannedRoute[] }
  | {
      type: "route"
      index: number // 1-based position within the planned routes
      status: "fetching" | "done"
      origin: string
      originAirport: string
      destination: string
      destAirport: string
      weekId: string
      weekLabel: string
      cached?: boolean
      offers?: number
      routable?: boolean
      cheapestUsdEach?: number | null
    }
  | { type: "result"; result: SearchResult }
  | { type: "error"; message: string }
