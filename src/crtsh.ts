import type { CrtShCertificate } from "./types.js";

const CRT_SH_BASE = "https://crt.sh/";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT = "certwatch/0.1 (+https://github.com/) - CT log brand-abuse monitor";

export interface CrtShClientOptions {
  /** Injectable fetch implementation, primarily for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

type ResolvedOptions = Required<CrtShClientOptions>;

function resolveOptions(options?: CrtShClientOptions): ResolvedOptions {
  return {
    fetchImpl: options?.fetchImpl ?? fetch,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    userAgent: options?.userAgent ?? DEFAULT_USER_AGENT,
  };
}

async function fetchWithTimeout(url: string, opts: ResolvedOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    return await opts.fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": opts.userAgent,
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the crt.sh JSON search URL for a given `q` value. `q` can be an
 * exact domain ("paypal.com") or a SQL LIKE-style wildcard pattern
 * ("%paypal%") - both are supported natively by crt.sh.
 */
export function buildCrtShUrl(qValue: string): string {
  const params = new URLSearchParams({ q: qValue, output: "json" });
  return `${CRT_SH_BASE}?${params.toString()}`;
}

async function queryCrtSh(qValue: string, options?: CrtShClientOptions): Promise<CrtShCertificate[]> {
  const opts = resolveOptions(options);
  const url = buildCrtShUrl(qValue);

  let response: Response;
  try {
    response = await fetchWithTimeout(url, opts);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`crt.sh request to ${url} failed: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(`crt.sh request to ${url} returned HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text || !text.trim()) {
    // crt.sh returns an empty 200 body when a query matches nothing.
    return [];
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as CrtShCertificate[]) : [];
  } catch {
    // crt.sh occasionally returns non-JSON (HTML error/interstitial pages)
    // when it's under heavy load. We surface that as "no usable data this
    // round" rather than crashing the whole scan - callers can retry later.
    throw new Error(`crt.sh returned a non-JSON response for query "${qValue}" (it may be overloaded - try again later)`);
  }
}

/** Query crt.sh for an exact domain name. */
export function queryDomain(domain: string, options?: CrtShClientOptions): Promise<CrtShCertificate[]> {
  return queryCrtSh(domain, options);
}

/**
 * Query crt.sh using a SQL LIKE-style wildcard pattern, e.g. "%paypal%".
 * See https://crt.sh/ for the full supported query syntax.
 */
export function queryPattern(pattern: string, options?: CrtShClientOptions): Promise<CrtShCertificate[]> {
  return queryCrtSh(pattern, options);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
