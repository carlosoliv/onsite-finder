import type { PolicyConfig } from "./types"

export const DEFAULT_POLICY: PolicyConfig = {
  longHaulUpgrade: true,
  longHaulThresholdHours: 10,
  capPremiumEconomy: true,
  advancePurchaseDays: 14,
  preferNonstop: true,
  excludeRefundable: true,
  medianCeiling: true,
  includeCheckedBag: true,
  includeSeatSelection: false,
  checkedBagFeeUsd: 45,
  seatSelectionFeeUsd: 18,
}

export const RANK: Record<string, number> = { ECONOMY: 0, PREMIUM_ECONOMY: 1 }
