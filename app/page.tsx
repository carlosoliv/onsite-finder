import { AppHeader } from "@/components/app-header"
import { OnsiteApp } from "@/components/onsite-app"
import { hasAmadeusKey } from "@/lib/flight-provider"

export default function Home() {
  const hasKey = hasAmadeusKey()
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main>
        <OnsiteApp hasKey={hasKey} />
      </main>
    </div>
  )
}
