"use client"

import { useState } from "react"
import { ChevronDown, Info, SlidersHorizontal } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { PolicyConfig } from "@/lib/types"

const TOGGLES: { key: keyof PolicyConfig; label: string; help: string }[] = [
  { key: "longHaulUpgrade", label: "Long-haul cabin upgrade", help: "If any single leg exceeds the threshold hours, premium economy is allowed for that route. Otherwise economy only." },
  { key: "capPremiumEconomy", label: "Cap at premium economy", help: "Never select business or first class, even if premium economy is unavailable." },
  { key: "preferNonstop", label: "Prefer nonstop", help: "Prefer nonstop itineraries; fall back to 1-stop options if none are found." },
  { key: "excludeRefundable", label: "Exclude refundable fares", help: "Skip fully-refundable / flexible fare classes." },
  { key: "medianCeiling", label: "Median fare ceiling", help: "Drop offers priced above the median fare of the allowed cabin for that route (a fair-market cap)." },
  { key: "includeCheckedBag", label: "Include 1 checked bag", help: "Add a standard checked-bag fee to fares that don't already include one." },
  { key: "includeSeatSelection", label: "Include seat selection", help: "Add a standard seat-selection fee per traveler." },
]

export function RulesCard({
  policy,
  setPolicy,
}: {
  policy: PolicyConfig
  setPolicy: (p: PolicyConfig) => void
}) {
  const [open, setOpen] = useState(false)

  function set<K extends keyof PolicyConfig>(key: K, value: PolicyConfig[K]) {
    setPolicy({ ...policy, [key]: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden />
          Travel policy
        </CardTitle>
        <CardDescription>Toggle the rules applied when pricing every route.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-3 rounded-lg px-1 py-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={t.key} className="cursor-pointer font-medium">
                {t.label}
              </Label>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" aria-label={`About ${t.label}`} className="text-muted-foreground hover:text-foreground">
                      <Info className="size-3.5" />
                    </button>
                  }
                />
                <TooltipContent>{t.help}</TooltipContent>
              </Tooltip>
            </div>
            <Switch
              id={t.key}
              checked={policy[t.key] as boolean}
              onCheckedChange={(v) => set(t.key, v as PolicyConfig[typeof t.key])}
            />
          </div>
        ))}

        <Collapsible open={open} onOpenChange={setOpen} className="mt-1 border-t border-border pt-2">
          <CollapsibleTrigger
            render={
              <button type="button" className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-medium hover:text-primary">
                Advanced parameters
                <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
              </button>
            }
          />
          <CollapsibleContent className="flex flex-col gap-3 px-1 pt-2">
            <NumField
              label="Long-haul threshold (hours)"
              value={policy.longHaulThresholdHours}
              onChange={(v) => set("longHaulThresholdHours", v)}
            />
            <NumField
              label="Advance-purchase minimum (days)"
              value={policy.advancePurchaseDays}
              onChange={(v) => set("advancePurchaseDays", v)}
            />
            <NumField
              label="Checked-bag fee (USD)"
              value={policy.checkedBagFeeUsd}
              onChange={(v) => set("checkedBagFeeUsd", v)}
            />
            <NumField
              label="Seat-selection fee (USD)"
              value={policy.seatSelectionFeeUsd}
              onChange={(v) => set("seatSelectionFeeUsd", v)}
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm font-normal text-secondary-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-24 tnums"
      />
    </div>
  )
}
