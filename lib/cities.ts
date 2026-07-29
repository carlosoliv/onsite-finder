import citiesData from "@/data/cities.json"
import type { City } from "./types"

export const CITIES = citiesData as City[]

export function findCity(name: string): City | undefined {
  return CITIES.find((c) => c.city.toLowerCase() === name.toLowerCase())
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0)
    return parts.find((p) => p.type === "currency")?.value ?? currency
  } catch {
    return currency
  }
}
