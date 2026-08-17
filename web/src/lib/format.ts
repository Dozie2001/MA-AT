import { formatUnits } from 'viem'

export function truncateAddress(value: string, width = 4) {
  return `${value.slice(0, width + 2)}...${value.slice(-width)}`
}

export function formatUsdc(value: bigint) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(formatUnits(value, 6)))
}

export function formatTimestamp(value: bigint) {
  if (value === 0n) return 'Not yet'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(Number(value) * 1_000))
}

export function explorerAddress(baseUrl: string, address: string) {
  return `${baseUrl}/address/${address}`
}

export function explorerTransaction(baseUrl: string, hash: string) {
  return `${baseUrl}/tx/${hash}`
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/user rejected|user denied|rejected the request/i.test(error.message)) {
      return 'Request cancelled in wallet.'
    }
    return error.message.split('\n')[0]
  }
  return 'The request could not be completed.'
}
