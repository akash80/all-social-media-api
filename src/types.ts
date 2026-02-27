/**
 * Platform codes: f = Facebook, i = Instagram, l = LinkedIn, t = Threads.
 */
export type PlatformCode = "f" | "i" | "l" | "t";

/**
 * Meta (Facebook + Instagram) configuration.
 * Same Page Access Token is used for both Facebook and Instagram.
 */
export interface MetaConfig {
  /** Page access token (long-lived). Required for posting. */
  pageAccessToken: string;
  /** Facebook Page ID. Required for Facebook posts. */
  pageId: string;
  /** Instagram Business Account ID (linked to the Page). Required for Instagram. */
  instagramBusinessAccountId?: string;
  /** Ad account ID (with or without act_ prefix). Required only if createAd is true. */
  adAccountId?: string;
  appId?: string;
  appSecret?: string;
}

/**
 * LinkedIn configuration. Use either personUrn (profile) or organizationUrn (Company Page).
 */
export interface LinkedInConfig {
  /** OAuth access token with w_member_social or w_organization_social scope. */
  accessToken: string;
  /** Person URN, e.g. urn:li:person:xxx. For posting to personal profile. */
  personUrn?: string;
  /** Organization URN, e.g. urn:li:organization:xxx. For posting to Company Page. */
  organizationUrn?: string;
}

/**
 * Threads (Meta) configuration.
 */
export interface ThreadsConfig {
  /** Threads user ID. */
  userId: string;
  /** Threads access token. */
  accessToken: string;
}

/**
 * Credentials per platform. Pass only the platforms you use.
 */
export interface SocialPostingConfig {
  meta?: MetaConfig;
  linkedin?: LinkedInConfig;
  threads?: ThreadsConfig;
}

/**
 * Platform-agnostic targeting for Meta ads (optional). Mapped to Meta Marketing API spec.
 * If you have your own targeting type (e.g. MarketingTargeting), map it to this shape before
 * passing to crossPost params. Example:
 * @example
 * const metaTargeting: MetaTargeting = {
 *   ageMin: myTargeting.minAge,
 *   ageMax: myTargeting.maxAge,
 *   countries: myTargeting.countryCodes,
 *   interests: myTargeting.interestIds?.map(id => ({ id })),
 * };
 */
export interface MetaTargeting {
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  countries?: string[];
  regions?: Array<{ key: string }>;
  cities?: Array<{ key: string; radius?: number; distance_unit?: "mile" | "kilometer" }>;
  zips?: Array<{ key: string }>;
  customLocations?: Array<{
    latitude?: number;
    longitude?: number;
    address_string?: string;
    radius?: number;
    distance_unit?: "mile" | "kilometer";
  }>;
  interests?: Array<{ id: string; name?: string }>;
  behaviors?: Array<{ id: string; name?: string }>;
  publisherPlatforms?: string[];
}

/**
 * Parameters for cross-posting to one or more platforms.
 */
export interface CrossPostParams {
  /** Platforms to post to: f = Facebook, i = Instagram, l = LinkedIn, t = Threads. */
  postOn: PlatformCode[];
  /** Main post content (or base content if contentAdapter is used). */
  content: string;
  /** Public image URL. Required for f, i, t if no imageBuffer + uploadImage. */
  imageUrl?: string;
  /** Image bytes. If provided and uploadImage option is set, library will resolve URL. */
  imageBuffer?: Buffer;
  /** Hashtags to append (array or space/comma-separated string). */
  hashtags?: string[] | string;
  /** Per-platform content override. If set for a platform, that text is used instead of content/contentAdapter. */
  platformContent?: Partial<Record<PlatformCode, string>>;
  /** Optional content suffix appended to all platforms (e.g. disclaimer). */
  contentSuffix?: string;

  // Meta (Facebook) only
  targeting?: MetaTargeting;
  createAd?: boolean;
  dailyBudget?: number;
  campaignName?: string;
  adSetName?: string;

  // Threads only (override config)
  threadsUserId?: string;
  threadsAccessToken?: string;
  altText?: string;
  linkAttachment?: string;

  // Optional retries for transient failures (rate limits, 5xx, network)
  /** Number of retry attempts (default 0). */
  retries?: number;
  /** Delay in ms before each retry (default 1000). Backoff can be applied by the caller. */
  retryDelayMs?: number;

  // LinkedIn: choose author when both personUrn and organizationUrn are in config
  /** When config has both personUrn and organizationUrn, post as this (default: "person"). */
  linkedinPostAs?: "person" | "organization";
}

/**
 * Result for a single platform attempt.
 */
export interface PlatformResult {
  platform: string;
  code: PlatformCode;
  postId?: string;
  error?: string;
  content?: string;
  /** Post URL when the platform provides one (e.g. Facebook, LinkedIn). */
  permalink?: string;
  /** ISO timestamp when the post was created, when available from the API. */
  postedAt?: string;
  /** 1-based attempt number when retries were used (e.g. 2 = "succeeded on 2nd attempt"). */
  attempt?: number;
}

/**
 * Result of a cross-post call. No persistence; caller saves if needed.
 */
export interface CrossPostResult {
  platformResults: PlatformResult[];
  failed: { platform: string; error: string }[];
  batchStatus: "full" | "partial" | "failed";
  /** When retries were used, the max attempt number across platforms (for logging). */
  maxAttempt?: number;
}

/**
 * Hint for uploadImage to build storage paths (e.g. marketing_posts/cross_123/image.png).
 */
export interface UploadImageHint {
  /** Platform code ("f" | "i" | "l" | "t") when known. */
  platform?: string;
  /** Your post/batch id when known, for path namespacing. */
  postId?: string;
}

/**
 * Optional: resolve image URL from buffer. Called by the client when imageBuffer is provided.
 * @param hint - Optional platform/postId for building storage paths (e.g. for debugging/cleanup).
 */
export type UploadImage = (
  buffer: Buffer,
  mimeType: string,
  hint?: UploadImageHint
) => Promise<string>;

/**
 * Optional: adapt content per platform (e.g. shorter for Threads, tone for LinkedIn).
 * @param platformCode - Platform code ("f"|"i"|"l"|"t") so you can switch without string-matching labels.
 */
export type ContentAdapter = (
  content: string,
  platformLabel: string,
  platformCode?: PlatformCode
) => Promise<string>;

// --- Get recent posts & comments ---

/**
 * Unified comment shape for all platforms (used in getRecentPosts when includeComments is true).
 */
export interface Comment {
  id: string;
  text: string;
  authorName?: string;
  timestamp?: string;
  replyCount?: number;
  replies?: Comment[];
}

/**
 * Unified post shape with optional comments (returned by getRecentPosts).
 */
export interface PostWithComments {
  code: PlatformCode;
  platform: string;
  postId: string;
  permalink?: string;
  text?: string;
  timestamp?: string;
  mediaType?: string;
  comments?: Comment[];
}

/**
 * Params for getRecentPosts.
 */
export interface GetRecentPostsParams {
  /** Platforms to fetch from: f, i, l, t. */
  channels: PlatformCode[];
  /** Max posts per channel (default 5). */
  limitPerChannel?: number;
  /** If true, each post includes comments (last N per post). */
  includeComments?: boolean;
  /** Max comments per post when includeComments is true (default 20). */
  commentsLimitPerPost?: number;
}

/**
 * Result of getRecentPosts.
 */
export interface GetRecentPostsResult {
  posts: PostWithComments[];
  errors: { platform: string; code: PlatformCode; error: string }[];
}

// --- Reply to comments ---

/**
 * Single reply request (channel-agnostic; optional fields per channel).
 * For f, i, l: commentId is required (reply to comment). For t: postId is required (reply to post).
 */
export interface ReplyRequest {
  channel: PlatformCode;
  message: string;
  /** Required for Facebook, Instagram, LinkedIn (reply to comment). */
  commentId?: string;
  /** Required for Threads (reply to post). Optional for others if API needs parent post. */
  postId?: string;
}

/**
 * Result for a single reply attempt.
 */
export interface ReplyResult {
  channel: string;
  code: PlatformCode;
  commentId?: string;
  replyId?: string;
  error?: string;
}

/**
 * Result of replyToComments (batch).
 * - results: replies that succeeded.
 * - failed: requests that reached the API but got an error.
 * - skipped: requests not attempted (e.g. missing commentId or config); not counted as failed.
 */
export interface ReplyToCommentsResult {
  results: ReplyResult[];
  failed: { channel: string; code: PlatformCode; error: string }[];
  skipped: { channel: string; code: PlatformCode; error: string }[];
  batchStatus: "full" | "partial" | "failed";
}

// --- Meta ads ---

/**
 * Params for runMetaAds (create and optionally start a Meta ad).
 */
export interface RunMetaAdsParams {
  content: string;
  imageUrl: string;
  targeting: MetaTargeting;
  dailyBudget: number;
  campaignName?: string;
  adSetName?: string;
  /** If true, set status ACTIVE on campaign, ad set, and ad; otherwise PAUSED. */
  startImmediately?: boolean;
}

/**
 * Result of runMetaAds.
 */
export interface RunMetaAdsResult {
  campaignId: string;
  adSetId: string;
  adId: string;
  status: "ACTIVE" | "PAUSED";
  error?: string;
}

// --- Delete post ---

/**
 * Params for deletePost.
 */
export interface DeletePostParams {
  channel: PlatformCode;
  postId: string;
}

/**
 * Result of deletePost. Instagram does not support delete; success is false with error.
 */
export interface DeletePostResult {
  success: boolean;
  error?: string;
}
