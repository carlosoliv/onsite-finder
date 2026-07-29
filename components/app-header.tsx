import { Plane } from "lucide-react"

export function AppHeader() {
  return (
    <header className="bg-ink text-ink-foreground">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-white/10">
            <Plane className="size-5 -rotate-12" aria-hidden />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">Onsite Finder</span>
            <span className="text-xs text-ink-foreground/70">Cheapest city &amp; week for your team onsite</span>
          </div>
        </div>
        <a
          href="https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-search"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-xs text-ink-foreground/80 underline-offset-4 hover:underline sm:block"
        >
          Powered by Amadeus Flight Offers
        </a>
      </div>
    </header>
  )
}
