import { generateObject } from "ai"
import { z } from "zod"
import { findCity } from "@/lib/cities"
import type { ResolvedCity } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({
  found: z
    .boolean()
    .describe("true only if the input clearly refers to a real, identifiable city or metro area served by an airport"),
  city: z.string().describe("Canonical English city name, e.g. 'Munich'. Empty string when not found."),
  iata: z
    .string()
    .describe("3-letter IATA code of the city's primary international passenger airport, e.g. 'MUC'. Uppercase."),
  country: z.string().describe("ISO 3166-1 alpha-2 country code, e.g. 'DE'. Uppercase."),
  currency: z.string().describe("ISO 4217 currency code used in that city, e.g. 'EUR'. Uppercase."),
  lat: z.number().describe("Latitude of the primary airport in decimal degrees."),
  lng: z.number().describe("Longitude of the primary airport in decimal degrees."),
})

export async function POST(req: Request) {
  let query = ""
  try {
    const body = (await req.json()) as { query?: string }
    query = (body.query ?? "").trim()
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  if (!query) {
    return Response.json({ error: "A city name is required." }, { status: 400 })
  }

  // Never spend a model call on a city we already know.
  const known = findCity(query)
  if (known) {
    const resolved: ResolvedCity = {
      found: true,
      city: known.city,
      iata: known.iata,
      country: known.country,
      currency: known.currency,
      lat: known.lat,
      lng: known.lng,
    }
    return Response.json(resolved)
  }

  try {
    const { object } = await generateObject({
      model: "openai/gpt-4.1-mini",
      schema,
      prompt:
        `Identify the city or metro area that best matches this user input for a flight-planning tool: "${query}".\n` +
        `Return its primary international passenger airport (the busiest one serving the city), its IATA code, ` +
        `ISO country code, local ISO 4217 currency, and the airport's latitude/longitude.\n` +
        `If the input is a misspelling of a real city, correct it. ` +
        `If the input does not clearly identify a real city, set found to false and leave the other fields empty.`,
    })

    if (!object.found || !object.iata || object.iata.length !== 3) {
      return Response.json({ found: false } satisfies Partial<ResolvedCity>)
    }

    const resolved: ResolvedCity = {
      found: true,
      city: object.city.trim(),
      iata: object.iata.trim().toUpperCase(),
      country: object.country.trim().toUpperCase(),
      currency: object.currency.trim().toUpperCase(),
      lat: object.lat,
      lng: object.lng,
    }
    console.log(`[v0] resolve-city "${query}" -> ${resolved.city} (${resolved.iata}, ${resolved.currency})`)
    return Response.json(resolved)
  } catch (err) {
    console.log(`[v0] resolve-city FAILED for "${query}":`, (err as Error)?.message)
    return Response.json({ error: "Could not search for that city right now." }, { status: 502 })
  }
}
