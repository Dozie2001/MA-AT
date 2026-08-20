export function parseRpcUrls(
  primaryUrl: string,
  fallbackUrls: Array<string | undefined> = [],
): string[] {
  const urls = [primaryUrl, ...fallbackUrls]
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url));

  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Sepolia RPC URLs must use HTTPS");
    }
  }

  return [...new Set(urls)];
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gu, "<redacted-url>");
}

export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:\b429\b|too many requests|rate[ -]?limit)/iu.test(message);
}

export function exponentialBackoffMs(
  baseDelayMs: number,
  failureCount: number,
  maximumDelayMs: number,
): number {
  if (failureCount <= 0) return baseDelayMs;
  const multiplier = 2 ** Math.min(failureCount - 1, 30);
  return Math.min(baseDelayMs * multiplier, maximumDelayMs);
}
