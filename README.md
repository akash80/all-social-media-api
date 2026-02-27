# all-social-media-api

[![npm version](https://img.shields.io/npm/v/all-social-media-api.svg)](https://www.npmjs.com/package/all-social-media-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen)](https://nodejs.org/)

**All social media api to Facebook, Instagram, Meta Ads, LinkedIn, and Threads from Node.js** with a simple, config-driven API. Framework-agnostic: pass your own credentials and optional image upload or content-adaptation callbacks.

---

## Why use this?

- **One API** — Post to one or more platforms, fetch recent posts with comments, reply in batch, create Meta ads, delete posts.
- **You own credentials** — The library never reads `process.env`; you pass a config object (from env, secrets, or anywhere).
- **Flexible** — Custom `uploadImage` (e.g. S3, Cloud Storage), per-platform `contentAdapter`, retries, progress callbacks.
- **Dual format** — ESM + CommonJS; works with `import` or `require` in Node, serverless, or any JS runtime.

---

## Install

```bash
npm install all-social-media-api
```

Requires **Node.js 18+** (uses native `fetch`).

---

## Credentials & token setup

The library does **not** read `.env` — you build a config object and pass it into the client (e.g. from `process.env` or a secrets manager).

| Platform   | Config key   | Required fields |
|-----------|---------------|-----------------|
| Facebook  | `config.meta` | `pageAccessToken`, `pageId` |
| Instagram | `config.meta` | `pageAccessToken`, `instagramBusinessAccountId` (same Page) |
| LinkedIn  | `config.linkedin` | `accessToken`, and `personUrn` and/or `organizationUrn` |
| Threads   | `config.threads` | `userId`, `accessToken` |

**Quick option:** Get tokens for Meta, LinkedIn, and Threads in one place with [Social OAuth](https://rfidsoftwares.com/social-oauth/).  
**Step-by-step:** See [Getting credentials and tokens](#getting-credentials-and-tokens) for Meta, LinkedIn, and Threads.

For local dev and the example, copy `.env.example` to `.env` and set the variables for the platforms you use.

---

## Quick start (copy-paste in 30 seconds)

```javascript
import { SocialPostingClient } from "all-social-media-api";

const config = {
  meta: {
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
    pageId: process.env.META_PAGE_ID,
    instagramBusinessAccountId: process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID,
  },
  linkedin: {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    personUrn: process.env.LINKEDIN_PERSON_URN,
  },
  threads: {
    userId: process.env.THREADS_USER_ID,
    accessToken: process.env.THREADS_ACCESS_TOKEN,
  },
};

const client = new SocialPostingClient(config);
const result = await client.crossPost({
  postOn: ["f", "i", "l", "t"],  // f=Facebook, i=Instagram, l=LinkedIn, t=Threads
  content: "Hello from all-social-media-api!",
  imageUrl: "https://example.com/image.jpg",
  hashtags: ["nodejs", "social"],
});

console.log(result.batchStatus);   // "full" | "partial" | "failed"
console.log(result.platformResults);
```

**CommonJS:** Use `const { SocialPostingClient } = require("all-social-media-api");` — no `await import()` needed.

---

## Full example

Run the included example from the package root:

```bash
cp .env.example .env   # fill in your tokens
npm run example
```

Or: `npx tsx examples/post-once.ts`. Optionally set `POST_IMAGE_URL`, `POST_CONTENT`, `POST_HASHTAGS` in `.env` for the example script.

---

## Architecture (high-level)

1. **Config** — You provide credentials per platform (meta, linkedin, threads). No magic env loading.
2. **Client** — `new SocialPostingClient(config, options?)`. Options: `uploadImage`, `contentAdapter`, `contentSuffix`, `progress`.
3. **Methods** — `crossPost`, `getRecentPosts`, `replyToComments`, `runMetaAds`, `deletePost`. Platform codes: `"f"` (Facebook), `"i"` (Instagram), `"l"` (LinkedIn), `"t"` (Threads).
4. **Images** — Use `imageUrl` (public URL) or `imageBuffer` + your own `uploadImage` callback that returns a public URL.

---

## Network behavior

This library uses `globalThis.fetch` for all HTTP requests, calling only the official social platform APIs you configure (and any image URLs you provide). It does not send telemetry or call unknown third‑party endpoints. Tools like Socket may show a "Network access" alert because outbound HTTP is required for these features; this is expected.

---

## API reference

### SocialPostingClient

```ts
const client = new SocialPostingClient(config, options?);
```

- **config:** Credentials per platform (see [Credentials & token setup](#credentials--token-setup)).
- **options:** Optional `uploadImage`, `contentAdapter`, `contentSuffix`, `progress` (see [Advanced usage](#advanced-usage)).

### crossPost(params)

| Param (key)   | Description |
|---------------|-------------|
| `postOn`      | `("f" \| "i" \| "l" \| "t")[]` — platforms to post to |
| `content`     | Main post text |
| `imageUrl`    | Public image URL (or use `imageBuffer` + `uploadImage`) |
| `imageBuffer` | Image bytes; requires `uploadImage` option |
| `hashtags`    | `string[]` or single string, appended to content |
| `platformContent` | Override content per platform |
| `createAd`    | Create Meta ad from post (needs `adAccountId` in config) |
| `retries` / `retryDelayMs` | Retry transient failures |
| `linkedinPostAs` | `"person"` \| `"organization"` when config has both URNs |

**Returns:** `{ platformResults, failed, batchStatus }` — each result includes `postId`, `permalink`, `error` when applicable.

### getRecentPosts(params)

Fetch recent posts from selected channels, with optional comments. Unified shape for all platforms.

```ts
const { posts, errors } = await client.getRecentPosts({
  channels: ["f", "i", "l", "t"],
  limitPerChannel: 5,
  includeComments: true,
  commentsLimitPerPost: 20,
});
```

### replyToComments(replies, options?)

Reply to comments (or to posts on Threads) in batch. Use `commentId` for Facebook/Instagram/LinkedIn; use `postId` for Threads.

```ts
const result = await client.replyToComments(
  [{ channel: "f", message: "Thanks!", commentId: "123" }, { channel: "t", message: "Reply", postId: "456" }],
  { batchLimit: 10 }
);
```

### runMetaAds(params)

Create (and optionally start) a Meta ad: campaign + ad set + creative. Requires `config.meta.adAccountId`. Targeting shape: use the exported `MetaTargeting` type (e.g. `countries`, `ageMin`, `ageMax`, `interests`).

```ts
const result = await client.runMetaAds({
  content: "Ad copy",
  imageUrl: "https://example.com/ad.jpg",
  targeting: { countries: ["US"], ageMin: 18, ageMax: 65 },
  dailyBudget: 20,
  campaignName: "My campaign",
  startImmediately: true,
});
```

### deletePost(params)

Delete a post on Facebook, LinkedIn, or Threads. **Instagram does not support delete via API.**

```ts
const result = await client.deletePost({ channel: "f", postId: "123" });
```

### SocialPostingError

Thrown on API or network errors. Properties: `message`, optional `code`, optional `details`.

---

## Advanced usage

### Configuration and env variables

| Variable | Platform | Description |
|----------|----------|-------------|
| `META_PAGE_ACCESS_TOKEN` | Meta | Page access token (Facebook + Instagram). |
| `META_PAGE_ID` | Meta | Facebook Page ID. |
| `META_INSTAGRAM_BUSINESS_ACCOUNT_ID` | Meta | For Instagram posting. |
| `META_AD_ACCOUNT_ID` | Meta | For `runMetaAds` / ad creation. |
| `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` | Threads | From Threads/Meta developer tools. |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_URN`, `LINKEDIN_ORGANIZATION_URN` | LinkedIn | OAuth token and URN(s). |

**Permalinks:** Successful posts in `platformResults` include a `permalink` when the platform provides it.

### Custom image upload (serverless)

When posting with `imageBuffer`, pass an `uploadImage` option that uploads to your storage and returns a public URL:

```javascript
const client = new SocialPostingClient(getConfig(), {
  uploadImage: async (buffer, mimeType, hint) => {
    // Upload to S3, Cloud Storage, Firebase, etc.
    const url = await myStorage.upload(buffer, mimeType, hint);
    return url;
  },
});
await client.crossPost({ postOn: ["f", "i"], content: "Hello", imageBuffer: myBuffer });
```

### contentAdapter and progress

- **contentAdapter:** `(content, platformLabel, platformCode?) => Promise<string>` — e.g. shorten for Threads (500 char limit).
- **contentSuffix:** Appended to all platform content.
- **progress:** `{ onPlatformStart?, onPlatformDone? }` — callbacks for incremental updates.

### Getting credentials and tokens

**Meta (Facebook + Instagram)**  
[Meta for Developers](https://developers.facebook.com/) → create/select app → add **Instagram Graph API**. Get a **Page Access Token** with `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`. Page ID: Page → Settings. Instagram Business Account ID: connect IG to Page in Business Suite, then `GET /{page-id}?fields=instagram_business_account`.

**LinkedIn**  
[LinkedIn Developer Portal](https://www.linkedin.com/developers/) → create app → scopes `w_member_social` and/or `w_organization_social` → OAuth flow → Person URN `urn:li:person:{id}` or Organization URN `urn:li:organization:{id}`.

**Threads**  
[Meta for Developers](https://developers.facebook.com/) → add **Threads** product → get User ID and Access Token from Threads API / Tools. Text limit **500 characters**. Long-lived tokens: add users as **Threads testers** for dev; for production, complete App Review. Use **Threads App secret** (not main Facebook App secret) for long-lived exchange.

---

## Testing

E2E tests are in `tests/` and cover all platforms and methods. Credentials come from **`.env`** (gitignored). Copy `.env.example` to `.env` and fill in tokens, then:

```bash
npm run build
npm run test:e2e
```

Tests skip platforms with missing config. To run the Meta ads creation test (creates a real paused ad), set `RUN_META_ADS=1` in `.env`.

**Post links:** Each crossPost test writes the post link to the **terminal** and appends it to **`.e2e-post-links.txt`** in the project root (gitignored). Open that file after a run to see all links.

**Troubleshooting:** If Instagram fails with "Only photo or video can be accepted", set `POST_IMAGE_URL` in `.env` to a URL that returns an image directly (e.g. `https://placehold.co/800x600.png`).

---

### Meta Ads – development access

If you see **Ads API access level: Development** and `Application does not have the capability to make this API call`:  
- **Option A (sandbox):** Meta for Developers → your app → Marketing API → Tools → create **Marketing API Sandbox** ad account; set `META_AD_ACCOUNT_ID` to that sandbox ID (no real spend).  
- **Option B (real ads):** App Review → request **Standard access** for `ads_management` and `ads_read`; after approval your real ad account will work.

### Threads token expiry

If Threads fails with "Session has expired", get a new **THREADS_ACCESS_TOKEN** from Meta for Developers (Threads → Tools). Tokens can expire quickly.

---

## Versioning

We follow **semver**. Patch = bug fixes; minor = new optional params/features; major = breaking changes. See [CHANGELOG.md](CHANGELOG.md).

---

## License

MIT © Akash Arora
