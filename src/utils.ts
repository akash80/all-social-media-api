import type { PlatformCode } from "./types.js";

/**
 * Normalize hashtags to array of tags without leading #.
 * @param hashtags - The hashtags to normalize.
 * @returns The normalized hashtags.
 */
export function normalizeHashtags(hashtags?: string[] | string): string[] {
  if (hashtags == null) return [];
  const parts = Array.isArray(hashtags)
    ? hashtags.map((t) => (typeof t === "string" && t.trim() ? t.trim().replace(/^#/, "") : "")).filter(Boolean)
    : String(hashtags)
        .split(/[\s,]+/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);
  return parts;
}

/**
 * Append space-separated #tag to content.
 * @param content - The content to append hashtags to.
 * @param hashtags - The hashtags to append.
 * @returns The content with hashtags appended.
 */
export function appendHashtags(content: string, hashtags?: string[] | string): string {
  const parts = normalizeHashtags(hashtags);
  if (parts.length === 0) return content;
  const formatted = parts.map((p) => (p.startsWith("#") ? p : `#${p}`)).join(" ");
  return `${content}\n${formatted}`.trim();
}

/**
 * Sanitize content for API (strip replacement chars, normalize line endings).
 * @param text - The text to sanitize.
 * @returns The sanitized text.
 */
export function sanitizeContent(text: string): string {
  return text
    .replace(/\uFFFD/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/**
 * Platform code to human-readable label.
 * @param code - The platform code.
 * @returns The human-readable label.
 */
export const CODE_TO_PLATFORM_LABEL: Record<PlatformCode, string> = {
  f: "Facebook",
  i: "Instagram",
  l: "LinkedIn",
  t: "Threads",
};
