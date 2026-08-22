export interface PayerMetrics {
  settledInvoiceCount: bigint
  onTimeSettlementCount: bigint
  lateSettlementCount: bigint
  lastSettledAt: bigint
  totalPaidUsdc: bigint
  tier: number
}

const usdcUnit = 1_000_000n

export function calculateTrustTier(
  metrics: Omit<PayerMetrics, 'tier'>,
): number {
  if (metrics.settledInvoiceCount === 0n) return 0

  const onTimeRateBps =
    (metrics.onTimeSettlementCount * 10_000n) / metrics.settledInvoiceCount

  if (metrics.settledInvoiceCount >= 3n && onTimeRateBps < 6_000n) return 4
  if (
    metrics.settledInvoiceCount >= 20n &&
    onTimeRateBps >= 9_000n &&
    metrics.totalPaidUsdc >= 50_000n * usdcUnit
  ) {
    return 3
  }
  if (
    metrics.settledInvoiceCount >= 5n &&
    onTimeRateBps >= 8_000n &&
    metrics.totalPaidUsdc >= 5_000n * usdcUnit
  ) {
    return 2
  }
  return 1
}

export function aggregatePayerMetrics(
  entries: ReadonlyArray<PayerMetrics>,
): PayerMetrics {
  const metrics = entries.reduce<Omit<PayerMetrics, 'tier'>>(
    (total, entry) => ({
      settledInvoiceCount:
        total.settledInvoiceCount + entry.settledInvoiceCount,
      onTimeSettlementCount:
        total.onTimeSettlementCount + entry.onTimeSettlementCount,
      lateSettlementCount:
        total.lateSettlementCount + entry.lateSettlementCount,
      lastSettledAt:
        total.lastSettledAt > entry.lastSettledAt
          ? total.lastSettledAt
          : entry.lastSettledAt,
      totalPaidUsdc: total.totalPaidUsdc + entry.totalPaidUsdc,
    }),
    {
      settledInvoiceCount: 0n,
      onTimeSettlementCount: 0n,
      lateSettlementCount: 0n,
      lastSettledAt: 0n,
      totalPaidUsdc: 0n,
    },
  )

  return { ...metrics, tier: calculateTrustTier(metrics) }
}
