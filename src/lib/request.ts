const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Library error for API failures. No dependency on app error types.
 */
export class SocialPostingError extends Error {
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "SocialPostingError";
    this.code = options?.code;
    this.details = options?.details;
    Object.setPrototypeOf(this, SocialPostingError.prototype);
  }
}

export interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Fetch with optional query params and timeout. Used by all platform clients.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { params, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;
  let target = url;
  if (params && Object.keys(params).length > 0) {
    const q = new URLSearchParams(params).toString();
    target = `${url}${url.includes("?") ? "&" : "?"}${q}`;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, { ...rest, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : "Request failed";
    throw new SocialPostingError(msg, { code: "NETWORK_ERROR", details: e });
  }
}

/**
 * Parse JSON or throw SocialPostingError.
 */
export function parseJson<T>(text: string, fallback: T, errorContext: string): T {
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    throw new SocialPostingError(`${errorContext}: invalid JSON`, {
      details: text.slice(0, 200),
    });
  }
}

/**
 * Throw SocialPostingError if response is not ok. Extract message from common API error shapes.
 */
export function throwIfNotOk(
  response: Response,
  body: string,
  platformName: string
): void {
  if (response.ok) return;
  let message = `${platformName} API error: ${response.status}`;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; error_user_msg?: string };
      message?: string;
    };
    const msg =
      parsed.error?.message ?? parsed.error?.error_user_msg ?? parsed.message;
    if (msg && typeof msg === "string") message = msg;
  } catch {
    // keep default
  }
  throw new SocialPostingError(message, {
    code: "API_ERROR",
    details: body.slice(0, 500),
  });
}

/** Returns true if the error is likely transient (retryable). */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof SocialPostingError) {
    if (err.code === "NETWORK_ERROR") return true;
    if (err.code === "API_ERROR" && err.details) {
      const d = err.details as string;
      if (/\b(429|5\d{2})\b/.test(d)) return true;
    }
  }
  if (err instanceof Error && /timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(err.message))
    return true;
  return false;
}

/**
 * Run a function with optional retries. Returns [result, attempt] where attempt is 1-based.
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  options: { retries?: number; retryDelayMs?: number }
): Promise<[T, number]> {
  const retries = Math.max(0, options.retries ?? 0);
  const delayMs = Math.max(0, options.retryDelayMs ?? 1000);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const result = await fn();
      return [result, attempt];
    } catch (e) {
      lastErr = e;
      if (attempt <= retries && isRetryableError(e)) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}
