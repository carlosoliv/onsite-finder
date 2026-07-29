import { runSearch } from "@/lib/algorithm"
import { hasIgnavKey } from "@/lib/flight-provider"
import type { OriginRow, PolicyConfig, SearchProgressEvent, Week } from "@/lib/types"

export const runtime = "nodejs"
// Progress is streamed as the search runs, so this must never be statically cached.
export const dynamic = "force-dynamic"

interface Body {
  origins: OriginRow[]
  weeks: Week[]
  policy: PolicyConfig
}

export async function POST(req: Request) {
  const { origins, weeks, policy } = (await req.json()) as Body

  console.log(
    `[v0] /api/search called | cities=${origins?.length} weeks=${weeks?.length} | hasIgnavKey=${hasIgnavKey()}`,
  )

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SearchProgressEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
      }

      try {
        if (!origins || origins.length < 2) throw new Error("At least two cities are required.")
        if (!weeks || weeks.length < 1) throw new Error("At least one week is required.")

        const started = Date.now()
        const result = await runSearch(origins, weeks, policy, { onProgress: send })
        console.log(
          `[v0] /api/search done in ${Date.now() - started}ms | ${result.totals.length} totals | usingFixtures=${result.usingFixtures}`,
        )
        send({ type: "result", result })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong."
        console.log(`[v0] /api/search FAILED:`, message)
        send({ type: "error", message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
