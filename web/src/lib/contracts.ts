import type { Address, Hex } from 'viem'

export const contracts = {
  settlementRouter: '0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe',
  invoiceRegistry: '0x3923CF7230ca3144F323FC884b1eACaF5860EF50',
  trustRegistry: '0xa6a3e5aa35571ff6f7e6F64Df3E457F56551821a',
  settlementVerifier: '0x56e06DD47711D8433D7160E28E6ad771a0fc7e2d',
  creditPolicy: '0x68169737E733f2b1461BB699b1f3Be05202A6dB5',
  sepoliaUsdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
} as const satisfies Record<string, Address>

export const demoEvidence = {
  invoiceId:
    '0x538ff4b046151de88401b9774abde0ed1a26a39fb3976057b551ab1f1f38b740',
  createTx:
    '0xebbdcf04423ee914f43a33ea325e9161dfcda8e42bbf3cf4c64d71b2e25ca4e2',
  paymentTx:
    '0xb8d079f555b3caac2d74ade0fcefebbd384d57294ac9d318fc964ae1dde0f58e',
  settlementTx:
    '0x643149722959cc293226e8ceab3d0e73881227c10aa9a69125c089c27d86c5b2',
} as const satisfies Record<string, Hex>

export const usdcIconUrl =
  'https://mintcdn.com/circle-167b8d39/K2XWSLhaeRomzNa1/images/assets/USDC_Token.svg?fit=max&auto=format&n=K2XWSLhaeRomzNa1&q=85&s=c89754c1e0dd17b3e1e1b0f32e256c9a'

export const invoiceRegistryAbi = [
  {
    type: 'function',
    name: 'createInvoice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'amount', type: 'uint128' },
      { name: 'dueAt', type: 'uint64' },
      { name: 'metadataHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'invoiceId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'cancelInvoice',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'invoiceId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getInvoice',
    stateMutability: 'view',
    inputs: [{ name: 'invoiceId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'vendor', type: 'address' },
          { name: 'buyer', type: 'address' },
          { name: 'amount', type: 'uint128' },
          { name: 'issuedAt', type: 'uint64' },
          { name: 'dueAt', type: 'uint64' },
          { name: 'settledAt', type: 'uint64' },
          { name: 'metadataHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
  {
    type: 'event',
    name: 'InvoiceCreated',
    inputs: [
      { name: 'invoiceId', type: 'bytes32', indexed: true },
      { name: 'vendor', type: 'address', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'issuedAt', type: 'uint256', indexed: false },
      { name: 'dueAt', type: 'uint256', indexed: false },
      { name: 'metadataHash', type: 'bytes32', indexed: false },
    ],
  },
] as const

export const settlementRouterAbi = [
  {
    type: 'function',
    name: 'payInvoice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'invoiceId', type: 'bytes32' },
      { name: 'vendor', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'InvoicePaid',
    inputs: [
      { name: 'invoiceId', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'vendor', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'paidAt', type: 'uint256', indexed: false },
    ],
  },
] as const

export const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const trustRegistryAbi = [
  {
    type: 'function',
    name: 'getPayerMetrics',
    stateMutability: 'view',
    inputs: [{ name: 'payer', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'settledInvoiceCount', type: 'uint64' },
          { name: 'onTimeSettlementCount', type: 'uint64' },
          { name: 'lateSettlementCount', type: 'uint64' },
          { name: 'lastSettledAt', type: 'uint64' },
          { name: 'totalPaidUsdc', type: 'uint256' },
          { name: 'tier', type: 'uint8' },
        ],
      },
    ],
  },
] as const

export const creditPolicyAbi = [
  {
    type: 'function',
    name: 'creditLimitUsdc',
    stateMutability: 'view',
    inputs: [{ name: 'payer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const invoiceStatuses = [
  'Unknown',
  'Open',
  'Settled',
  'Cancelled',
] as const
export const trustTiers = [
  'Unrated',
  'Bronze',
  'Silver',
  'Gold',
  'Restricted',
] as const
