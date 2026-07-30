import { hasIgnavKey, searchIgnavAirports } from "@/lib/flight-provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Server-side proxy for Ignav airport lookup so the API key stays private.
// Returns { enabled: false, results: [] } when no key is configured, which the
// client uses to keep its local-list-only behavior (fixtures mode).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") ?? ""
  const limitParam = Number(searchParams.get("limit"))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 8

  if (!hasIgnavKey()) {
    return Response.json({ enabled: false, results: [] })
  }

  const results = await searchIgnavAirports(q, limit)
  return Response.json(
    { enabled: true, results },
    {
      headers: {
        // Autocomplete queries repeat a lot; let the browser cache briefly.
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    },
  )
}
