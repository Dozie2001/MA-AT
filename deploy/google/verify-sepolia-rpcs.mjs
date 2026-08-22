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

const routerAddress = "0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe";
const paymentTopic =
  "0x9615dc2d5d2739a2b83f1e48261a6f845a996c0a54209b3044193556e74414cc";
const logRange = Number(process.env.SEPOLIA_LOG_TEST_RANGE ?? "10");

async function rpc(url, method, id, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
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
    const fromBlock = Math.max(0, blockNumber - (logRange - 1));
    const logs = await rpc(url, "eth_getLogs", endpoint * 10, [
      {
        address: routerAddress,
        topics: [paymentTopic],
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: blockNumberHex,
      },
    ]);
    if (!Array.isArray(logs)) throw new Error("invalid eth_getLogs response");
    console.log(
      `Endpoint ${endpoint}: Sepolia block ${blockNumber}, ${logRange}-block log query passed`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Endpoint ${endpoint} failed: ${message}`);
  }
}

console.log("All Sepolia RPC endpoints passed");
