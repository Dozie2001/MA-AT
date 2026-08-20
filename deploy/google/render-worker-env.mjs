#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const checkOnly = process.argv.includes('--check')
const envArgument = process.argv.slice(2).find((argument) => argument !== '--check')
const envPath = resolve(envArgument ?? '.env')
const source = readFileSync(envPath, 'utf8')

function readEnvValue(name) {
  const matches = source
    .split(/\r?\n/u)
    .filter((line) => line.trimStart().startsWith(`${name}=`))

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${name} entry in ${envPath}`)
  }

  const line = matches[0].trimStart()
  let value = line.slice(name.length + 1).trim()
  const quote = value.at(0)

  if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
    value = value.slice(1, -1)
  }

  if (!value || /[\r\n\s#]/u.test(value)) {
    throw new Error(`${name} must be a non-empty value without whitespace or comments`)
  }

  return value
}

const sepoliaRpcUrl = readEnvValue('SEPOLIA_RPC_URL')
const sepoliaFallbackRpcUrl1 = readEnvValue('SEPOLIA_FALLBACK_RPC_URL_1')
const sepoliaFallbackRpcUrl2 = readEnvValue('SEPOLIA_FALLBACK_RPC_URL_2')
const creditcoinPrivateKey = readEnvValue('CREDITCOIN_PRIVATE_KEY')

const parsedRpcUrl = new URL(sepoliaRpcUrl)
if (parsedRpcUrl.protocol !== 'https:') {
  throw new Error('SEPOLIA_RPC_URL must use HTTPS')
}

for (const fallbackRpcUrl of [sepoliaFallbackRpcUrl1, sepoliaFallbackRpcUrl2]) {
  if (new URL(fallbackRpcUrl).protocol !== 'https:') {
    throw new Error('Sepolia fallback RPC URLs must use HTTPS')
  }
}

if (!/^(?:0x)?[0-9a-fA-F]{64}$/u.test(creditcoinPrivateKey)) {
  throw new Error('CREDITCOIN_PRIVATE_KEY must be a 32-byte hex value')
}

const values = {
  SEPOLIA_RPC_URL: sepoliaRpcUrl,
  SEPOLIA_FALLBACK_RPC_URL_1: sepoliaFallbackRpcUrl1,
  SEPOLIA_FALLBACK_RPC_URL_2: sepoliaFallbackRpcUrl2,
  CREDITCOIN_RPC_URL: 'https://rpc.cc3-testnet.creditcoin.network',
  CREDITCOIN_PRIVATE_KEY: creditcoinPrivateKey,
  ATTESTCOIN_PROOF_API_URL: 'https://proof-gen-api.cc3-testnet.creditcoin.network',
  ATTESTCOIN_CHAIN_KEY_SEPOLIA: '1',
  CREDITCOIN_CHAIN_ID: '102031',
  SETTLEMENT_ROUTER_ADDRESS: '0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe',
  INVOICE_REGISTRY_ADDRESS: '0x3923CF7230ca3144F323FC884b1eACaF5860EF50',
  MAAT_SETTLEMENT_VERIFIER_ADDRESS: '0x56e06DD47711D8433D7160E28E6ad771a0fc7e2d',
  SETTLEMENT_CURSOR_FILE: '/var/lib/maat-worker/settlement-cursor.json',
  SETTLEMENT_ROUTER_DEPLOYMENT_BLOCK: '11508491',
  SETTLEMENT_SCAN_CHUNK_SIZE: '10',
  SETTLEMENT_SCAN_INTERVAL_MS: '1000',
  SETTLEMENT_POLL_INTERVAL_MS: '15000',
  SETTLEMENT_RETRY_INTERVAL_MS: '30000',
  SETTLEMENT_RETRY_MAX_INTERVAL_MS: '300000',
}

if (checkOnly) {
  process.stdout.write(`Validated ${Object.keys(values).length} worker environment variables.\n`)
} else {
  for (const [name, value] of Object.entries(values)) {
    process.stdout.write(`${name}=${value}\n`)
  }
}
