const urls = [
  process.env.SEPOLIA_RPC_URL,
  process.env.SEPOLIA_FALLBACK_RPC_URL_1,
  process.env.SEPOLIA_FALLBACK_RPC_URL_2,
]
  .map((url) => url?.trim())
  .filter(Boolean);

if (urls.length !== 3) {
  throw new Error(`Expected 3 Sepolia RPC endpoints, found ${urls.length}`);
}

async function rpc(url, method, id) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: [] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`RPC ${payload.error.code}`);
  return payload.result;
}

for (const [index, url] of urls.entries()) {
  const endpoint = index + 1;
  try {
    const [chainIdHex, blockNumberHex] = await Promise.all([
      rpc(url, "eth_chainId", endpoint * 2),
      rpc(url, "eth_blockNumber", endpoint * 2 + 1),
    ]);
    const chainId = Number.parseInt(chainIdHex, 16);
    const blockNumber = Number.parseInt(blockNumberHex, 16);
    if (chainId !== 11_155_111) {
      throw new Error(`unexpected chain ID ${chainId}`);
    }
    console.log(`Endpoint ${endpoint}: Sepolia block ${blockNumber}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Endpoint ${endpoint} failed: ${message}`);
  }
}

console.log("All Sepolia RPC endpoints passed");
