import { createServerFn } from '@tanstack/react-start'
import { decodeEventLog, encodeEventTopics, isHex } from 'viem'

import { contracts, settlementRouterAbi } from './contracts'

const settlementRouterDeploymentBlock = '11508491'
const sepoliaChainId = '11155111'

type ExplorerLog = {
  data: `0x${string}`
  topics: [`0x${string}`, ...Array<`0x${string}`>]
  transactionHash: `0x${string}`
}

type ExplorerPayload = {
  status?: string
  message?: string
  result?: ExplorerLog[] | string
}

async function queryExplorer(url: URL): Promise<ExplorerLog[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    throw new Error(`Payment history provider returned HTTP ${response.status}`)
  }

  const payload = (await response.json()) as ExplorerPayload
  if (payload.status === '1' && Array.isArray(payload.result)) {
    return payload.result
  }
  if (
    payload.status === '0' &&
    ((Array.isArray(payload.result) && payload.result.length === 0) ||
      (typeof payload.result === 'string' &&
        /no (?:records|logs) found/iu.test(payload.result)))
  ) {
    return []
  }
  throw new Error('Payment history provider rejected the lookup')
}

function invoiceIdValidator(input: { invoiceId: string }) {
  if (
    !isHex(input.invoiceId, { strict: true }) ||
    input.invoiceId.length !== 66
  ) {
    throw new Error('A valid 32-byte invoice ID is required')
  }
  return { invoiceId: input.invoiceId }
}

export const getInvoicePaymentHistory = createServerFn({ method: 'GET' })
  .validator(invoiceIdValidator)
  .handler(async ({ data }) => {
    const apiKey = process.env.ETHERSCAN_API_KEY?.trim()

    const [eventTopic, invoiceTopic] = encodeEventTopics({
      abi: settlementRouterAbi,
      eventName: 'InvoicePaid',
      args: { invoiceId: data.invoiceId },
    })

    const commonQuery = {
      module: 'logs',
      action: 'getLogs',
      fromBlock: settlementRouterDeploymentBlock,
      toBlock: 'latest',
      address: contracts.settlementRouter,
      topic0: eventTopic,
      topic0_1_opr: 'and',
      topic1: invoiceTopic,
      page: '1',
      offset: '1000',
    }
    const etherscanUrl = new URL('https://api.etherscan.io/v2/api')
    etherscanUrl.search = new URLSearchParams({
      ...commonQuery,
      chainid: sepoliaChainId,
      apikey: apiKey ?? '',
    }).toString()
    const blockscoutUrl = new URL('https://eth-sepolia.blockscout.com/api')
    blockscoutUrl.search = new URLSearchParams(commonQuery).toString()

    const providers = await Promise.allSettled([
      apiKey
        ? queryExplorer(etherscanUrl)
        : Promise.reject(new Error('Etherscan is not configured')),
      queryExplorer(blockscoutUrl),
    ])
    const successfulResults = providers.flatMap((provider) =>
      provider.status === 'fulfilled' ? provider.value : [],
    )
    if (providers.every((provider) => provider.status === 'rejected')) {
      throw new Error('All payment history providers are unavailable')
    }

    const uniqueLogs = [
      ...new Map(
        successfulResults.map((log) => [
          log.transactionHash.toLowerCase(),
          log,
        ]),
      ).values(),
    ]
    return uniqueLogs.map((log) => {
      const decoded = decodeEventLog({
        abi: settlementRouterAbi,
        eventName: 'InvoicePaid',
        data: log.data,
        topics: log.topics,
        strict: true,
      })
      if (
        decoded.args.invoiceId.toLowerCase() !== data.invoiceId.toLowerCase()
      ) {
        throw new Error('Payment history returned an unexpected invoice')
      }
      return {
        transactionHash: log.transactionHash,
        invoiceId: decoded.args.invoiceId,
        payer: decoded.args.payer,
        vendor: decoded.args.vendor,
        amount: decoded.args.amount.toString(),
        paidAt: decoded.args.paidAt.toString(),
      }
    })
  })
