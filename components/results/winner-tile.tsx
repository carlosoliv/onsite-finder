"use client"

import { motion } from "framer-motion"
import { Plane, Trophy } from "lucide-react"
import { CountUp } from "@/components/count-up"
import { formatUsd } from "@/lib/format"
import type { CityWeekTotal, Week } from "@/lib/types"

export function WinnerTile({
  winner,
  runnerUp,
  weekLabels,
}: {
  winner: CityWeekTotal
  runnerUp?: CityWeekTotal
  weekLabels: Map<string, string>
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="gradient-brand relative overflow-hidden rounded-2xl p-6 text-primary-foreground shadow-lg sm:p-8"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 opacity-15">
        <Plane className="size-48 -rotate-12" aria-hidden />
      </div>
      <div className="relative flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-medium opacity-90">
          <Trophy className="size-4" aria-hidden />
          Cheapest onsite
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-pretty text-3xl font-bold tracking-tight sm:text-4xl">{winner.destination}</h2>
          <span className="text-base font-medium opacity-90 tnums">{weekLabels.get(winner.weekId)}</span>
        </div>
        <CountUp value={winner.totalUsd} className="mt-2 text-4xl font-bold tracking-tight tnums sm:text-5xl" />
        <p className="text-sm opacity-90">total round-trip cost for everyone</p>

        {runnerUp && (
          <div className="mt-4 w-fit rounded-lg bg-white/15 px-3 py-1.5 text-sm backdrop-blur-sm">
            <span className="opacity-90">Runner-up: </span>
            <span className="font-semibold">{runnerUp.destination}</span>
            <span className="opacity-90"> · {weekLabels.get(runnerUp.weekId)} · </span>
            <span className="font-semibold tnums">{formatUsd(runnerUp.totalUsd)}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
