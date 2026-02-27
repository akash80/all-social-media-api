/**
 * Minimal example: read config from env and cross-post once.
 * Run after building the library:
 *   npm run build
 *   npx tsx examples/post-once.ts
 * Or with Node (if you compile this file):
 *   node examples/post-once.mjs
 *
 * When installed via npm, use: import { SocialPostingClient } from "all-social-media-api";
 *
 * Required env vars (set at least for the platforms you use):
 *   META_PAGE_ACCESS_TOKEN, META_PAGE_ID
 *   META_INSTAGRAM_BUSINESS_ACCOUNT_ID (for Instagram)
 *   LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN or LINKEDIN_ORGANIZATION_URN
 *   THREADS_USER_ID, THREADS_ACCESS_TOKEN
 */

import { SocialPostingClient } from "../dist/index.js";
import type { SocialPostingConfig } from "../dist/index.js";

function getConfig(): SocialPostingConfig {
  const config: SocialPostingConfig = {};
  if (process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID) {
    config.meta = {
      pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
      pageId: process.env.META_PAGE_ID,
      instagramBusinessAccountId: process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID ?? undefined,
    };
  }
  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    config.linkedin = {
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      personUrn: process.env.LINKEDIN_PERSON_URN ?? undefined,
      organizationUrn: process.env.LINKEDIN_ORGANIZATION_URN ?? undefined,
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

async function main() {
  const config = getConfig();
  if (!config.meta && !config.linkedin && !config.threads) {
    console.error(
      "Set at least one platform's env vars. See README for META_*, LINKEDIN_*, THREADS_*."
    );
    process.exit(1);
  }

  const postOn: Array<"f" | "i" | "l" | "t"> = [];
  if (config.meta?.pageId) postOn.push("f");
  if (config.meta?.instagramBusinessAccountId) postOn.push("i");
  if (config.linkedin) postOn.push("l");
  if (config.threads) postOn.push("t");

  if (postOn.length === 0) {
    console.error("No platform had required credentials. Check env.");
    process.exit(1);
  }

  const imageUrl = process.env.POST_IMAGE_URL;
  if (!imageUrl?.trim() && (postOn.includes("f") || postOn.includes("i") || postOn.includes("t"))) {
    console.error(
      "POST_IMAGE_URL is required when posting to Facebook, Instagram, or Threads."
    );
    process.exit(1);
  }

  const client = new SocialPostingClient(config);
  const result = await client.crossPost({
    postOn,
    content: process.env.POST_CONTENT ?? "Hello from all-social-media-api!",
    imageUrl: imageUrl?.trim() || undefined,
    hashtags: process.env.POST_HASHTAGS?.split(/[\s,]+/).filter(Boolean),
  });

  console.log("batchStatus:", result.batchStatus);
  console.log("platformResults:", JSON.stringify(result.platformResults, null, 2));
  if (result.failed.length) console.log("failed:", result.failed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
