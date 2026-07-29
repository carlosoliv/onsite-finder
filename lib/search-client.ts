import type { SearchInput, SearchProgressEvent } from "./types"

// POST the search and consume the NDJSON progress stream, invoking `onEvent`
// for every progress event as it arrives (start, per-route, result, error).
export async function streamSearch(
  input: SearchInput,
  onEvent: (event: SearchProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Search request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // NDJSON: one JSON object per line. Keep the trailing partial line buffered.
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as SearchProgressEvent)
      } catch {
        // Ignore malformed lines; a partial write will be completed next chunk.
      }
    }
  }

  const tail = buffer.trim()
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as SearchProgressEvent)
    } catch {
      // ignore
    }
  }
}
