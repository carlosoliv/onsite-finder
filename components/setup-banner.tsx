"use client"

import { KeyRound } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function SetupBanner({ hasKey }: { hasKey: boolean }) {
  if (hasKey) return null
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>Demo mode — using sample fixtures</AlertTitle>
      <AlertDescription>
        <span>
          Live pricing uses the Ignav Flight API. Add your API key to{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.local</code> and restart the dev server to run
          real searches:
        </span>
        <pre className="mt-1 w-full overflow-x-auto rounded-md bg-ink p-3 font-mono text-xs text-ink-foreground">
          {`IGNAV_API_KEY=********`}
        </pre>
        <span className="text-xs text-muted-foreground">
          Get a free API key from the Ignav dashboard at ignav.com. Until then, results below use deterministic sample data so
          you can explore the UI.
        </span>
      </AlertDescription>
    </Alert>
  )
}
