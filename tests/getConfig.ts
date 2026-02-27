/**
 * Build SocialPostingConfig from process.env.
 * Load .env before running e2e tests (e.g. via dotenv-cli: dotenv -e .env -- vitest run).
 * This file is safe to commit; actual secrets live in .env (gitignored).
 */
import type { SocialPostingConfig } from "all-social-media-api";

export function getTestConfig(): SocialPostingConfig {
  const config: SocialPostingConfig = {};

  if (process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID) {
    config.meta = {
      pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
      pageId: process.env.META_PAGE_ID,
      instagramBusinessAccountId: process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID || undefined,
      adAccountId: process.env.META_AD_ACCOUNT_ID || undefined,
    };
  }

  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    config.linkedin = {
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      personUrn: process.env.LINKEDIN_PERSON_URN || undefined,
      organizationUrn: process.env.LINKEDIN_ORGANIZATION_URN || undefined,
    };
  }

  if (process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN) {
    config.threads = {
      userId: process.env.THREADS_USER_ID,
      accessToken: process.env.THREADS_ACCESS_TOKEN,
    };
  }

  return config;
}

/** Public test image URL for crossPost e2e (no auth). Must be a direct image URL (no redirects); Instagram rejects e.g. picsum redirects with "Only photo or video can be accepted". Override with POST_IMAGE_URL in .env. */
export const TEST_IMAGE_URL = process.env.POST_IMAGE_URL || "https://firebasestorage.googleapis.com/v0/b/rfid-softwares.firebasestorage.app/o/marketing_posts%2Fmp_1770906938956_jr42gi43%2Fgenerated.png?alt=media";

export function hasMetaConfig(): boolean {
  return !!(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID);
}

export function hasLinkedInConfig(): boolean {
  return !!process.env.LINKEDIN_ACCESS_TOKEN;
}

export function hasThreadsConfig(): boolean {
  return !!(process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN);
}
