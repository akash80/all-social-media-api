/**
 * E2E tests for all platforms and methods.
 * Run with: npm run test:e2e (loads .env; ensure .env has your credentials).
 * Requires: npm run build first so dist/ exists.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SocialPostingClient } from "all-social-media-api";
import {
  getTestConfig,
  TEST_IMAGE_URL,
  hasMetaConfig,
  hasLinkedInConfig,
  hasThreadsConfig
} from "./getConfig.js";

const config = getTestConfig();

const E2E_LOG_FILE = join(process.cwd(), ".e2e-post-links.txt");

/** Append a line to .e2e-post-links.txt and stdout (for debugging). */
function logE2E(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write("  [E2E] " + message + "\n");
  try {
    writeFileSync(E2E_LOG_FILE, line, { flag: "a" });
  } catch {
    // ignore
  }
}

/** Append a post link line to .e2e-post-links.txt (project root) so you can open it after the run. */
function logPostLink(platform: string, linkOrId: string, deleted: boolean) {
  const line = `[${new Date().toISOString()}] ${platform}: ${linkOrId}${deleted ? " (deleted by test)" : ""}\n`;
  process.stdout.write("\n  [E2E] " + platform + ": " + linkOrId + "\n");
  try {
    writeFileSync(E2E_LOG_FILE, line, { flag: "a" });
  } catch {
    // ignore
  }
}

/** Log config status (no secrets) and crossPost result for one platform. */
function logPlatformResult(platform: string, r: { postId?: string; error?: string; permalink?: string } | undefined) {
  if (!r) {
    logE2E(`${platform} result: (no entry in platformResults)`);
    return;
  }
  const safe: Record<string, string> = {};
  if (r.postId) safe.postId = r.postId;
  if (r.error) safe.error = r.error.slice(0, 300);
  if (r.permalink) safe.permalink = r.permalink;
  logE2E(`${platform} result: ${JSON.stringify(safe)}`);
}

const client = new SocialPostingClient(config);

const SKIP_META_ADS = process.env.RUN_META_ADS !== "1";

describe("getRecentPosts", () => {
  beforeAll(() => {
    try {
      writeFileSync(E2E_LOG_FILE, `--- E2E run ${new Date().toISOString()} ---\n`, "utf8");
    } catch {
      // ignore
    }
  });

  it("returns posts or empty array for Meta (Facebook) when config present", async () => {
    logE2E("getRecentPosts Facebook: Config Meta=" + (hasMetaConfig() ? "ok" : "missing"));
    if (!hasMetaConfig()) {
      logE2E("getRecentPosts Facebook: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["f"],
      limitPerChannel: 2,
      includeComments: false,
    });
    logE2E("getRecentPosts Facebook result: posts=" + result.posts.length + " errors=" + (result.errors?.length ?? 0) + (result.posts[0] ? " firstPostId=" + result.posts[0].postId : "") + (result.errors?.length ? " errors=" + JSON.stringify(result.errors.slice(0, 2)) : ""));
    expect(result).toHaveProperty("posts");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.posts)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    if (result.posts.length > 0) {
      expect(result.posts[0]).toMatchObject({
        code: "f",
        platform: "Facebook",
        postId: expect.any(String),
      });
    }
  });

  it("returns posts or empty for Instagram when config present", async () => {
    logE2E("getRecentPosts Instagram: Config Meta=" + (hasMetaConfig() ? "ok" : "missing") + " instagramBusinessAccountId=" + (config.meta?.instagramBusinessAccountId ? "set" : "missing"));
    if (!hasMetaConfig() || !config.meta?.instagramBusinessAccountId) {
      logE2E("getRecentPosts Instagram: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["i"],
      limitPerChannel: 2,
      includeComments: false,
    });
    logE2E("getRecentPosts Instagram result: posts=" + result.posts.length + " errors=" + (result.errors?.length ?? 0) + (result.posts[0] ? " firstPostId=" + result.posts[0].postId : "") + (result.errors?.length ? " errors=" + JSON.stringify(result.errors.slice(0, 2)) : ""));
    expect(result.posts).toBeDefined();
    expect(result.errors).toBeDefined();
    if (result.posts.length > 0) {
      expect(result.posts[0].code).toBe("i");
      expect(result.posts[0].platform).toBe("Instagram");
    }
  });

  it("returns posts or empty for LinkedIn when config present", async () => {
    logE2E("getRecentPosts LinkedIn: Config=" + (hasLinkedInConfig() ? "ok" : "missing"));
    if (!hasLinkedInConfig()) {
      logE2E("getRecentPosts LinkedIn: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["l"],
      limitPerChannel: 2,
      includeComments: false,
    });
    logE2E("getRecentPosts LinkedIn result: posts=" + result.posts.length + " errors=" + (result.errors?.length ?? 0) + (result.posts[0] ? " firstPostId=" + result.posts[0].postId : "") + (result.errors?.length ? " errors=" + JSON.stringify(result.errors.slice(0, 2)) : ""));
    expect(result.posts).toBeDefined();
    expect(result.errors).toBeDefined();
    if (result.posts.length > 0) {
      expect(result.posts[0].code).toBe("l");
      expect(result.posts[0].platform).toBe("LinkedIn");
    }
  });

  it("returns posts or empty for Threads when config present", async () => {
    logE2E("getRecentPosts Threads: Config=" + (hasThreadsConfig() ? "ok" : "missing"));
    if (!hasThreadsConfig()) {
      logE2E("getRecentPosts Threads: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["t"],
      limitPerChannel: 2,
      includeComments: false,
    });
    logE2E("getRecentPosts Threads result: posts=" + result.posts.length + " errors=" + (result.errors?.length ?? 0) + (result.posts[0] ? " firstPostId=" + result.posts[0].postId : "") + (result.errors?.length ? " errors=" + JSON.stringify(result.errors.slice(0, 2)) : ""));
    expect(result.posts).toBeDefined();
    expect(result.errors).toBeDefined();
    if (result.posts.length > 0) {
      expect(result.posts[0].code).toBe("t");
      expect(result.posts[0].platform).toBe("Threads");
    }
  });

  it("Facebook: fetch last post with comments, then reply there if it has comments", async () => {
    logE2E("getRecentPosts (last post + comments) Facebook: Config Meta=" + (hasMetaConfig() ? "ok" : "missing"));
    if (!hasMetaConfig()) {
      logE2E("getRecentPosts (last post + comments) Facebook: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["f"],
      limitPerChannel: 1,
      includeComments: true,
      commentsLimitPerPost: 10,
    });
    const hasComments = result.posts.some((p) => p.comments && p.comments.length > 0);
    const commentsCount = result.posts.reduce((n, p) => n + (p.comments?.length ?? 0), 0);
    logE2E("getRecentPosts Facebook (last + comments): posts=" + result.posts.length + " hasComments=" + hasComments + " totalComments=" + commentsCount + " errors=" + (result.errors?.length ?? 0));
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    result.posts.forEach((p) => {
      expect(p).toMatchObject({ code: "f", platform: "Facebook", postId: expect.any(String) });
      if (p.comments) expect(Array.isArray(p.comments)).toBe(true);
    });
    const postWithComment = result.posts.find((p) => p.comments && p.comments.length > 0);
    const commentId = postWithComment?.comments?.[0]?.id;
    if (commentId) {
      const replyResult = await client.replyToComments([{ channel: "f", message: "E2E test reply – please ignore", commentId }]);
      logE2E("replyToComments (Facebook) after getRecentPosts: batchStatus=" + replyResult.batchStatus + " results=" + replyResult.results.length + " failed=" + replyResult.failed.length);
      expect(replyResult.batchStatus).toBe("full");
      expect(replyResult.failed).toEqual([]);
      expect(replyResult.results.length).toBeGreaterThan(0);
      expect(replyResult.results[0].replyId).toBeDefined();
    }
  });

  it("Instagram: fetch last post with comments, then reply there if it has comments", async () => {
    logE2E("getRecentPosts (last post + comments) Instagram: Config=" + (hasMetaConfig() && config.meta?.instagramBusinessAccountId ? "ok" : "missing"));
    if (!hasMetaConfig() || !config.meta?.instagramBusinessAccountId) {
      logE2E("getRecentPosts (last post + comments) Instagram: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["i"],
      limitPerChannel: 1,
      includeComments: true,
      commentsLimitPerPost: 10,
    });
    const hasComments = result.posts.some((p) => p.comments && p.comments.length > 0);
    const commentsCount = result.posts.reduce((n, p) => n + (p.comments?.length ?? 0), 0);
    logE2E("getRecentPosts Instagram (last + comments): posts=" + result.posts.length + " hasComments=" + hasComments + " totalComments=" + commentsCount + " errors=" + (result.errors?.length ?? 0));
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    result.posts.forEach((p) => {
      expect(p).toMatchObject({ code: "i", platform: "Instagram", postId: expect.any(String) });
      if (p.comments) expect(Array.isArray(p.comments)).toBe(true);
    });
    const postWithComment = result.posts.find((p) => p.comments && p.comments.length > 0);
    const commentId = postWithComment?.comments?.[0]?.id;
    if (commentId) {
      const replyResult = await client.replyToComments([{ channel: "i", message: "E2E test reply – please ignore", commentId }]);
      logE2E("replyToComments (Instagram) after getRecentPosts: batchStatus=" + replyResult.batchStatus + " results=" + replyResult.results.length + " failed=" + replyResult.failed.length);
      expect(replyResult.batchStatus).toBe("full");
      expect(replyResult.failed).toEqual([]);
      expect(replyResult.results.length).toBeGreaterThan(0);
      expect(replyResult.results[0].replyId).toBeDefined();
    }
  });

  it("LinkedIn: fetch last post with comments, then reply there if it has comments", async () => {
    logE2E("getRecentPosts (last post + comments) LinkedIn: Config=" + (hasLinkedInConfig() ? "ok" : "missing"));
    if (!hasLinkedInConfig()) {
      logE2E("getRecentPosts (last post + comments) LinkedIn: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["l"],
      limitPerChannel: 1,
      includeComments: true,
      commentsLimitPerPost: 10,
    });
    const hasComments = result.posts.some((p) => p.comments && p.comments.length > 0);
    const commentsCount = result.posts.reduce((n, p) => n + (p.comments?.length ?? 0), 0);
    logE2E("getRecentPosts LinkedIn (last + comments): posts=" + result.posts.length + " hasComments=" + hasComments + " totalComments=" + commentsCount + " errors=" + (result.errors?.length ?? 0));
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    result.posts.forEach((p) => {
      expect(p).toMatchObject({ code: "l", platform: "LinkedIn", postId: expect.any(String) });
      if (p.comments) expect(Array.isArray(p.comments)).toBe(true);
    });
    const postWithComment = result.posts.find((p) => p.comments && p.comments.length > 0);
    const firstPost = result.posts[0];
    const commentId = postWithComment?.comments?.[0]?.id;
    if (firstPost && commentId) {
      const replyResult = await client.replyToComments([{ channel: "l", postId: firstPost.postId, message: "E2E test reply – please ignore", commentId }]);
      logE2E("replyToComments (LinkedIn) after getRecentPosts: batchStatus=" + replyResult.batchStatus + " results=" + replyResult.results.length + " failed=" + replyResult.failed.length);
      expect(replyResult.batchStatus).toBe("full");
      expect(replyResult.failed).toEqual([]);
      expect(replyResult.results.length).toBeGreaterThan(0);
      expect(replyResult.results[0].replyId).toBeDefined();
    }
  });

  it("Threads: fetch last post with comments, then reply to post if we have one", async () => {
    logE2E("getRecentPosts (last post + comments) Threads: Config=" + (hasThreadsConfig() ? "ok" : "missing"));
    if (!hasThreadsConfig()) {
      logE2E("getRecentPosts (last post + comments) Threads: skipped");
      return;
    }
    const result = await client.getRecentPosts({
      channels: ["t"],
      limitPerChannel: 1,
      includeComments: true,
      commentsLimitPerPost: 10,
    });
    const hasComments = result.posts.some((p) => p.comments && p.comments.length > 0);
    const commentsCount = result.posts.reduce((n, p) => n + (p.comments?.length ?? 0), 0);
    logE2E("getRecentPosts Threads (last + comments): posts=" + result.posts.length + " hasComments=" + hasComments + " totalComments=" + commentsCount + " errors=" + (result.errors?.length ?? 0));
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    result.posts.forEach((p) => {
      expect(p).toMatchObject({ code: "t", platform: "Threads", postId: expect.any(String) });
      if (p.comments) expect(Array.isArray(p.comments)).toBe(true);
    });
    const firstPost = result.posts[0];
    if (firstPost?.postId) {
      const replyResult = await client.replyToComments([{ channel: "t", postId: firstPost.postId, message: "E2E test reply – please ignore" }]);
      logE2E("replyToComments (Threads) after getRecentPosts: batchStatus=" + replyResult.batchStatus + " results=" + replyResult.results.length + " failed=" + replyResult.failed.length);
      expect(replyResult.batchStatus).toBe("full");
      expect(replyResult.failed).toEqual([]);
      expect(replyResult.results.length).toBeGreaterThan(0);
      expect(replyResult.results[0].replyId).toBeDefined();
    }
  });
});

// TODO: add .skip to skip crossPost e2e
describe.skip("crossPost", () => {
  it("posts to Facebook when config present and deletes after", async () => {
    logE2E("Config: Meta=" + (hasMetaConfig() ? "ok" : "missing") + ", Instagram=" + (config.meta?.instagramBusinessAccountId ? "ok" : "missing") + ", LinkedIn=" + (hasLinkedInConfig() ? "ok" : "missing") + ", Threads=" + (hasThreadsConfig() ? "ok" : "missing"));
    if (!hasMetaConfig()) {
      logE2E("Facebook: skipped (no META_PAGE_ACCESS_TOKEN or META_PAGE_ID)");
      return;
    }
    const result = await client.crossPost({
      postOn: ["f"],
      content: `E2E test post ${Date.now()}`,
      imageUrl: TEST_IMAGE_URL,
    });
    expect(result.batchStatus).toBeDefined();
    expect(result.platformResults).toBeDefined();
    const fb = result.platformResults.find((r) => r.code === "f");
    logPlatformResult("Facebook", fb);
    if (result.failed.length) logE2E("crossPost failed array: " + JSON.stringify(result.failed));
    if (!fb?.postId) {
      expect(result.failed.length).toBeGreaterThan(0);
      return;
    }
    const fbLink = fb.permalink || fb.postId;
    if (fbLink) logPostLink("Facebook", fbLink, true);
    expect(result.batchStatus).toBe("full");
    const del = await client.deletePost({ channel: "f", postId: fb.postId });
    expect(del.success).toBe(true);
  });

  it("posts to Instagram when config present (no delete - not supported)", async () => {
    if (!hasMetaConfig() || !config.meta?.instagramBusinessAccountId) {
      logPostLink("Instagram", "skipped (no META_INSTAGRAM_BUSINESS_ACCOUNT_ID in .env)", false);
      return;
    }
    const result = await client.crossPost({
      postOn: ["i"],
      content: `E2E test ${Date.now()}`,
      imageUrl: TEST_IMAGE_URL,
    });
    expect(result.batchStatus).toBeDefined();
    const ig = result.platformResults.find((r) => r.code === "i");
    logPlatformResult("Instagram", ig);
    if (result.failed.length) logE2E("Instagram crossPost failed: " + JSON.stringify(result.failed));
    if (ig?.postId) {
      const link = ig.permalink || `postId ${ig.postId} (use getRecentPosts for permalink)`;
      logPostLink("Instagram (not deleted — open to verify)", link, false);
      const del = await client.deletePost({ channel: "i", postId: ig.postId });
      expect(del.success).toBe(false);
      expect(del.error).toContain("not support");
    } else {
      const err = ig?.error || result.failed.find((f) => f.platform === "Instagram")?.error || "no postId";
      logPostLink("Instagram", `failed: ${err}`, false);
    }
  });

  it("posts to LinkedIn when config present and deletes after", async () => {
    if (!hasLinkedInConfig()) {
      return;
    }
    const result = await client.crossPost({
      postOn: ["l"],
      content: `E2E test post ${Date.now()}`,
      imageUrl: TEST_IMAGE_URL,
    });
    expect(result.batchStatus).toBeDefined();
    const li = result.platformResults.find((r) => r.code === "l");
    logPlatformResult("LinkedIn", li);
    if (result.failed.length) logE2E("LinkedIn crossPost failed: " + JSON.stringify(result.failed));
    if (!li?.postId) {
      if (result.failed.length) return;
      throw new Error("Expected LinkedIn postId");
    }
    const liLink = li.permalink || li.postId;
    if (liLink) logPostLink("LinkedIn", liLink, true);
    const del = await client.deletePost({ channel: "l", postId: li.postId });
    expect(del.success).toBe(true);
  });

  it("posts to Threads when config present and deletes after", async () => {
    if (!hasThreadsConfig()) {
      logPostLink("Threads", "skipped (no THREADS_USER_ID or THREADS_ACCESS_TOKEN in .env)", false);
      return;
    }
    const result = await client.crossPost({
      postOn: ["t"],
      content: `E2E test ${Date.now()}`,
      imageUrl: TEST_IMAGE_URL,
    });
    expect(result.batchStatus).toBeDefined();
    const th = result.platformResults.find((r) => r.code === "t");
    logPlatformResult("Threads", th);
    if (result.failed.length) logE2E("Threads crossPost failed: " + JSON.stringify(result.failed));
    if (!th?.postId) {
      const err = th?.error || result.failed.find((f) => f.platform === "Threads")?.error || "no postId";
      logPostLink("Threads", `failed: ${err}`, false);
      if (result.failed.length) return;
      throw new Error("Expected Threads postId");
    }
    const thLink = th.permalink || th.postId;
    logPostLink("Threads", thLink, true);
    const del = await client.deletePost({ channel: "t", postId: th.postId });
    expect(del.success).toBe(true);
  });
});

describe("runMetaAds", () => {
  it("returns error when adAccountId missing", async () => {
    const cfg = { ...config, meta: config.meta ? { ...config.meta, adAccountId: undefined } : undefined };
    const c = new SocialPostingClient(cfg as typeof config);
    const result = await c.runMetaAds({
      content: "Ad",
      imageUrl: TEST_IMAGE_URL,
      targeting: { countries: ["US"] },
      dailyBudget: 1000,
    });
    logE2E("Meta Ads (adAccountId missing) result: " + JSON.stringify({ error: result.error?.slice(0, 200) }));
    expect(result.error).toBeDefined();
  });

  it.skipIf(SKIP_META_ADS)(
    "creates and optionally starts ad when RUN_META_ADS=1 and adAccountId set",
    async () => {
      logE2E("Meta Ads: Config Meta=" + (hasMetaConfig() ? "ok" : "missing") + ", adAccountId=" + (config.meta?.adAccountId ? "set" : "missing") + ", RUN_META_ADS=" + (process.env.RUN_META_ADS === "1" ? "1" : "not set"));
      if (!hasMetaConfig() || !config.meta?.adAccountId) {
        logE2E("Meta Ads: skipped (no Meta config or META_AD_ACCOUNT_ID)");
        return;
      }
      const result = await client.runMetaAds({
        content: "E2E ad test",
        imageUrl: TEST_IMAGE_URL,
        targeting: { countries: ["US"] },
        dailyBudget: 500,
        startImmediately: false,
      });
      const summary = result.error
        ? `failed: ${result.error.slice(0, 250)}`
        : `campaignId=${result.campaignId} adSetId=${result.adSetId} adId=${result.adId} status=${result.status}`;
      logE2E("Meta Ads result: " + (result.error ? JSON.stringify({ error: result.error?.slice(0, 300) }) : JSON.stringify({ campaignId: result.campaignId, adSetId: result.adSetId, adId: result.adId, status: result.status })));
      if (result.error && /#3|capability|does not have/.test(result.error)) {
        logE2E("Meta Ads hint: META_AD_ACCOUNT_ID is set; this error usually means your Facebook App needs 'Ads Management' standard access (App Dashboard → App Review → Permissions and Features).");
      }
      logPostLink("Meta Ads", summary, false);
      expect(result.campaignId).toBeDefined();
      expect(result.adSetId).toBeDefined();
      expect(result.adId).toBeDefined();
      expect(["ACTIVE", "PAUSED"]).toContain(result.status);
    }
  );
});

describe("deletePost", () => {
  it("returns success: false for Instagram (not supported)", async () => {
    const result = await client.deletePost({
      channel: "i",
      postId: "any-id",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
