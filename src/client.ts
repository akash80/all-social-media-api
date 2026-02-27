import type {
  SocialPostingConfig,
  CrossPostParams,
  CrossPostResult,
  PlatformResult,
  PlatformCode,
  UploadImage,
  ContentAdapter,
  GetRecentPostsParams,
  GetRecentPostsResult,
  PostWithComments,
  Comment as CommentType,
  ReplyRequest,
  ReplyToCommentsResult,
  ReplyResult,
  RunMetaAdsParams,
  RunMetaAdsResult,
  DeletePostParams,
  DeletePostResult,
} from "./types.js";
import { appendHashtags, sanitizeContent, CODE_TO_PLATFORM_LABEL } from "./utils.js";
import { withRetries } from "./lib/request.js";
import {
  postToMeta,
  getPageRecentPosts,
  getPostComments as getMetaPostComments,
  replyToComment as metaReplyToComment,
  deletePost as metaDeletePost,
  runMetaAds as metaRunMetaAds,
} from "./platforms/meta.js";
import {
  postToInstagram,
  getUserMedia,
  getMediaComments,
  replyToComment as instagramReplyToComment,
  deletePost as instagramDeletePost,
} from "./platforms/instagram.js";
import {
  postToLinkedIn,
  getRecentPosts as linkedInGetRecentPosts,
  getPostComments as linkedInGetPostComments,
  replyToComment as linkedInReplyToComment,
  deletePost as linkedInDeletePost,
} from "./platforms/linkedin.js";
import {
  postToThreads,
  getUserThreads,
  getReplies as threadsGetReplies,
  getRepliesForPost as threadsGetRepliesForPost,
  replyToPost as threadsReplyToPost,
  deletePost as threadsDeletePost,
} from "./platforms/threads.js";

const POST_ON_FACEBOOK: PlatformCode = "f";
const POST_ON_INSTAGRAM: PlatformCode = "i";
const POST_ON_LINKEDIN: PlatformCode = "l";
const POST_ON_THREADS: PlatformCode = "t";

/** Progress callbacks for incremental UI or persistence (e.g. "Facebook done, Instagram in progress"). */
export interface CrossPostProgressCallbacks {
  /** Called before each platform post starts. Platforms run in the order of params.postOn. */
  onPlatformStart?: (platform: string, code: PlatformCode) => void;
  /** Called after each platform completes (success or failure). */
  onPlatformDone?: (platform: string, code: PlatformCode, result: PlatformResult) => void;
}

export interface SocialPostingClientOptions {
  /** When imageBuffer is provided in params, call this to get a public image URL. */
  uploadImage?: UploadImage;
  /** Optional per-platform content adaptation (e.g. shorten for Threads, tone for LinkedIn). */
  contentAdapter?: ContentAdapter;
  /** Optional suffix appended to all platform content (e.g. disclaimer). */
  contentSuffix?: string;
  /** Optional progress callbacks for long-running batches (platform started/finished). */
  progress?: CrossPostProgressCallbacks;
}

/**
 * Client for cross-posting to Facebook, Instagram, LinkedIn, and Threads.
 * Pass config and optional uploadImage/contentAdapter; no Firebase or env inside.
 * @param config - The SocialPostingConfig object.
 * @param options - The SocialPostingClientOptions object.
 */
export class SocialPostingClient {
  private readonly config: SocialPostingConfig;
  private readonly options: SocialPostingClientOptions;

  constructor(config: SocialPostingConfig, options?: SocialPostingClientOptions) {
    this.config = config;
    this.options = options ?? {};
  }

  /**
   * Post to the requested platforms. Returns results; no persistence.
   * Platforms run in the order of params.postOn. Use options.progress for incremental updates.
   * @param params - The CrossPostParams object.
   * @returns The CrossPostResult object.
   */
  async crossPost(params: CrossPostParams): Promise<CrossPostResult> {
    let imageUrl: string | undefined = params.imageUrl?.trim();
    if (!imageUrl && params.imageBuffer && params.imageBuffer.length > 0 && this.options.uploadImage) {
      imageUrl = await this.options.uploadImage(params.imageBuffer, "image/png", {});
    }
    if (!imageUrl && params.imageBuffer && params.imageBuffer.length > 0) {
      throw new Error(
        "imageBuffer provided but no uploadImage option; pass imageUrl or set uploadImage in options"
      );
    }

    const contentSuffix = params.contentSuffix ?? this.options.contentSuffix ?? "";
    const baseContent =
      contentSuffix && params.content
        ? `${params.content}\n${contentSuffix}`.trim()
        : params.content;

    const platformResults: PlatformResult[] = [];
    const failed: { platform: string; error: string }[] = [];
    const retries = Math.max(0, params.retries ?? 0);
    const retryDelayMs = Math.max(0, params.retryDelayMs ?? 1000);
    let maxAttempt = 1;

    for (const code of params.postOn) {
      const label = CODE_TO_PLATFORM_LABEL[code];
      let content: string =
        params.platformContent?.[code]?.trim() ?? baseContent;
      if (this.options.contentAdapter && content) {
        content = (await this.options.contentAdapter(content, label, code))?.trim() ?? content;
      }
      content = appendHashtags(content, params.hashtags);
      content = sanitizeContent(content);

      this.options.progress?.onPlatformStart?.(label, code);

      try {
        if (code === POST_ON_FACEBOOK) {
          const metaConfig = this.config.meta;
          if (!metaConfig?.pageAccessToken || !metaConfig?.pageId) {
            failed.push({ platform: label, error: "Meta config missing (pageAccessToken, pageId)" });
            const pr: PlatformResult = { platform: label, code, error: "Meta config missing (pageAccessToken, pageId)", content };
            platformResults.push(pr);
            this.options.progress?.onPlatformDone?.(label, code, pr);
            continue;
          }
          if (!imageUrl) {
            failed.push({ platform: label, error: "Facebook requires imageUrl (or imageBuffer + uploadImage)" });
            const pr: PlatformResult = { platform: label, code, error: "Facebook requires imageUrl (or imageBuffer + uploadImage)", content };
            platformResults.push(pr);
            this.options.progress?.onPlatformDone?.(label, code, pr);
            continue;
          }
          const doPost = async (): Promise<PlatformResult> => {
            const result = await postToMeta(metaConfig, {
              content,
              imageUrl,
              targeting: params.targeting,
              createAd: params.createAd,
              dailyBudget: params.dailyBudget,
              campaignName: params.campaignName,
              adSetName: params.adSetName,
            });
            return {
              platform: label,
              code,
              postId: result.postId,
              content,
              permalink: result.permalink,
              postedAt: new Date().toISOString(),
            };
          };
          const [pr, attempt] = retries > 0
            ? await withRetries(doPost, { retries, retryDelayMs })
            : [await doPost(), 1];
          const withAttempt = { ...pr, attempt };
          if (attempt > maxAttempt) maxAttempt = attempt;
          platformResults.push(withAttempt);
          this.options.progress?.onPlatformDone?.(label, code, withAttempt);
        } else if (code === POST_ON_INSTAGRAM) {
          const metaConfig = this.config.meta;
          if (!metaConfig?.pageAccessToken || !metaConfig?.instagramBusinessAccountId) {
            failed.push({
              platform: label,
              error: "Meta config missing (pageAccessToken, instagramBusinessAccountId)",
            });
            const pr: PlatformResult = { platform: label, code, error: "Meta config missing (pageAccessToken, instagramBusinessAccountId)", content };
            platformResults.push(pr);
            this.options.progress?.onPlatformDone?.(label, code, pr);
            continue;
          }
          if (!imageUrl) {
            failed.push({ platform: label, error: "Instagram requires imageUrl (or imageBuffer + uploadImage)" });
            const pr: PlatformResult = { platform: label, code, error: "Instagram requires imageUrl (or imageBuffer + uploadImage)", content };
            platformResults.push(pr);
            this.options.progress?.onPlatformDone?.(label, code, pr);
            continue;
          }
          const doPost = async (): Promise<PlatformResult> => {
            const result = await postToInstagram(metaConfig, { content, imageUrl });
            return {
              platform: label,
              code,
              postId: result.postId,
              permalink: result.permalink,
              content,
              postedAt: new Date().toISOString(),
            };
          };
          const [pr, attempt] = retries > 0
            ? await withRetries(doPost, { retries, retryDelayMs })
            : [await doPost(), 1];
          const withAttempt = { ...pr, attempt };
          if (attempt > maxAttempt) maxAttempt = attempt;
          platformResults.push(withAttempt);
          this.options.progress?.onPlatformDone?.(label, code, withAttempt);
        } else if (code === POST_ON_LINKEDIN) {
          const linkedInConfig = this.config.linkedin;
          if (!linkedInConfig?.accessToken) {
            failed.push({ platform: label, error: "LinkedIn config missing (accessToken)" });
            const pr: PlatformResult = { platform: label, code, error: "LinkedIn config missing (accessToken)", content };
            platformResults.push(pr);
            this.options.progress?.onPlatformDone?.(label, code, pr);
            continue;
          }
          const postAs = params.linkedinPostAs ?? "person";
          const authorUrn = postAs === "organization"
            ? (linkedInConfig.organizationUrn?.trim() ?? linkedInConfig.personUrn?.trim())
            : (linkedInConfig.personUrn?.trim() ?? linkedInConfig.organizationUrn?.trim());
          if (!authorUrn) {
            failed.push({
              platform: label,
              error: "LinkedIn config missing (personUrn or organizationUrn); linkedinPostAs=" + postAs,
            });
            const pr: PlatformResult = { platform: label, code, error: "LinkedIn config missing (personUrn or organizationUrn)", content };
            platformResults.push(pr);
            this.options.progress?.onPlatformDone?.(label, code, pr);
            continue;
          }
          const doPost = async (): Promise<PlatformResult> => {
            const result = await postToLinkedIn(
              {
                ...linkedInConfig,
                personUrn: postAs === "person" ? authorUrn : undefined,
                organizationUrn: postAs === "organization" ? authorUrn : undefined,
              },
              { content, imageUrl }
            );
            return {
              platform: label,
              code,
              postId: result.postId,
              content,
              permalink: result.permalink,
              postedAt: new Date().toISOString(),
            };
          };
          const [pr, attempt] = retries > 0
            ? await withRetries(doPost, { retries, retryDelayMs })
            : [await doPost(), 1];
          const withAttempt = { ...pr, attempt };
          if (attempt > maxAttempt) maxAttempt = attempt;
          platformResults.push(withAttempt);
          this.options.progress?.onPlatformDone?.(label, code, withAttempt);
        } else if (code === POST_ON_THREADS) {
          const threadsUserId =
            params.threadsUserId?.trim() ?? this.config.threads?.userId?.trim();
          const threadsAccessToken =
            params.threadsAccessToken?.trim() ?? this.config.threads?.accessToken?.trim();
          if (!threadsUserId || !threadsAccessToken) {
            failed.push({
              platform: label,
              error: "Threads config missing (userId, accessToken) or pass in params",
            });
            const pr: PlatformResult = { platform: label, code, error: "Threads config missing (userId, accessToken)", content };
            platformResults.push(pr);
            this.options.progress?.onPlatformDone?.(label, code, pr);
            continue;
          }
          const doPost = async (): Promise<PlatformResult> => {
            const result = await postToThreads(
              { userId: threadsUserId, accessToken: threadsAccessToken },
              {
                content,
                imageUrl,
                altText: params.altText,
                linkAttachment: params.linkAttachment,
              }
            );
            return {
              platform: label,
              code,
              postId: result.postId,
              permalink: result.permalink,
              content,
              postedAt: new Date().toISOString(),
            };
          };
          const [pr, attempt] = retries > 0
            ? await withRetries(doPost, { retries, retryDelayMs })
            : [await doPost(), 1];
          const withAttempt = { ...pr, attempt };
          if (attempt > maxAttempt) maxAttempt = attempt;
          platformResults.push(withAttempt);
          this.options.progress?.onPlatformDone?.(label, code, withAttempt);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ platform: label, error: msg });
        const pr: PlatformResult = { platform: label, code, error: msg, content };
        platformResults.push(pr);
        this.options.progress?.onPlatformDone?.(label, code, pr);
      }
    }

    const completedCount = platformResults.filter((r) => r.postId).length;
    const failedCount = failed.length;
    const batchStatus: CrossPostResult["batchStatus"] =
      failedCount === 0 ? "full" : completedCount === 0 ? "failed" : "partial";

    return {
      platformResults,
      failed,
      batchStatus,
      ...(maxAttempt > 1 && { maxAttempt }),
    };
  }

  /**
   * Fetch recent posts from the selected channels, with optional comments.
   * Returns a unified shape for all platforms (AI-friendly).
   * @param params - The GetRecentPostsParams object.
   * @returns The GetRecentPostsResult object.
   */
  async getRecentPosts(params: GetRecentPostsParams): Promise<GetRecentPostsResult> {
    const channels = params.channels ?? [];
    const limitPerChannel = Math.min(100, Math.max(1, params.limitPerChannel ?? 5));
    const includeComments = params.includeComments ?? false;
    const commentsLimitPerPost = Math.min(100, Math.max(1, params.commentsLimitPerPost ?? 20));
    const posts: PostWithComments[] = [];
    const errors: { platform: string; code: PlatformCode; error: string }[] = [];

    for (const code of channels) {
      const label = CODE_TO_PLATFORM_LABEL[code];
      try {
        if (code === POST_ON_FACEBOOK) {
          const metaConfig = this.config.meta;
          if (!metaConfig?.pageAccessToken || !metaConfig?.pageId) {
            errors.push({ platform: label, code, error: "Meta config missing" });
            continue;
          }
          const raw = await getPageRecentPosts(metaConfig, limitPerChannel);
          for (const p of raw) {
            const postId = p.id;
            let comments: CommentType[] | undefined;
            if (includeComments) {
              const rawComments = await getMetaPostComments(metaConfig, postId, commentsLimitPerPost);
              comments = rawComments.map((c) => ({
                id: c.id,
                text: c.message ?? "",
                authorName: c.from?.name,
                timestamp: c.created_time,
                replyCount: undefined,
              }));
            }
            posts.push({
              code,
              platform: label,
              postId,
              text: p.message,
              timestamp: p.created_time,
              permalink: p.permalink_url,
              comments,
            });
          }
        } else if (code === POST_ON_INSTAGRAM) {
          const metaConfig = this.config.meta;
          if (!metaConfig?.pageAccessToken || !metaConfig?.instagramBusinessAccountId) {
            errors.push({ platform: label, code, error: "Meta Instagram config missing" });
            continue;
          }
          const raw = await getUserMedia(metaConfig, limitPerChannel);
          for (const p of raw) {
            let comments: CommentType[] | undefined;
            if (includeComments) {
              const rawComments = await getMediaComments(metaConfig, p.id, commentsLimitPerPost);
              comments = rawComments.map((c) => ({
                id: c.id,
                text: c.text ?? "",
                authorName: c.username,
                timestamp: c.timestamp,
                replyCount: c.like_count,
              }));
            }
            posts.push({
              code,
              platform: label,
              postId: p.id,
              text: p.caption,
              timestamp: p.timestamp,
              permalink: p.permalink,
              mediaType: p.media_type,
              comments,
            });
          }
        } else if (code === POST_ON_LINKEDIN) {
          const linkedInConfig = this.config.linkedin;
          if (!linkedInConfig?.accessToken) {
            errors.push({ platform: label, code, error: "LinkedIn config missing" });
            continue;
          }
          const raw = await linkedInGetRecentPosts(linkedInConfig, limitPerChannel);
          for (const p of raw) {
            let comments: CommentType[] | undefined;
            if (includeComments) {
              try {
                const rawComments = await linkedInGetPostComments(
                  linkedInConfig,
                  p.id,
                  commentsLimitPerPost
                );
                comments = rawComments.map((c) => ({
                  id: c.id,
                  text: c.message ?? "",
                  authorName: c.actor,
                  timestamp: c.createdAt != null ? new Date(c.createdAt).toISOString() : undefined,
                }));
              } catch {
                comments = [];
              }
            }
            posts.push({
              code,
              platform: label,
              postId: p.id,
              text: p.commentary,
              timestamp: p.createdAt != null ? new Date(p.createdAt).toISOString() : undefined,
              permalink: p.permalink,
              comments,
            });
          }
        } else if (code === POST_ON_THREADS) {
          const threadsConfig = this.config.threads;
          if (!threadsConfig?.userId || !threadsConfig?.accessToken) {
            errors.push({ platform: label, code, error: "Threads config missing" });
            continue;
          }
          const raw = await getUserThreads(threadsConfig, limitPerChannel);
          for (const p of raw) {
            let comments: CommentType[] | undefined;
            if (includeComments) {
              try {
                const rawReplies = await threadsGetRepliesForPost(threadsConfig, p.id, commentsLimitPerPost);
                comments = rawReplies.map((r) => ({
                  id: r.id,
                  text: r.text ?? "",
                  authorName: r.username,
                  timestamp: r.timestamp,
                }));
              } catch {
                comments = [];
              }
            }
            posts.push({
              code,
              platform: label,
              postId: p.id,
              text: p.text,
              timestamp: p.timestamp,
              permalink: p.permalink,
              mediaType: p.media_type,
              comments,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ platform: label, code, error: msg });
      }
    }

    return { posts, errors };
  }

  /**
   * Reply to comments (or posts on Threads) in batch. Processes in chunks of batchLimit (default 10).
   * @param replies - The ReplyRequest array.
   * @param options - The options object.
   * @returns The ReplyToCommentsResult object.
   */
  async replyToComments(
    replies: ReplyRequest[],
    options?: { batchLimit?: number }
  ): Promise<ReplyToCommentsResult> {
    const batchLimit = Math.min(50, Math.max(1, options?.batchLimit ?? 10));
    const results: ReplyResult[] = [];
    const failed: { channel: string; code: PlatformCode; error: string }[] = [];
    const skipped: { channel: string; code: PlatformCode; error: string }[] = [];

    for (let i = 0; i < replies.length; i += batchLimit) {
      const batch = replies.slice(i, i + batchLimit);
      for (const req of batch) {
        const label = CODE_TO_PLATFORM_LABEL[req.channel];
        try {
          if (req.channel === POST_ON_FACEBOOK) {
            const metaConfig = this.config.meta;
            if (!metaConfig?.pageAccessToken || !req.commentId) {
              skipped.push({ channel: label, code: req.channel, error: "Meta config or commentId missing" });
              continue;
            }
            const { replyId } = await metaReplyToComment(metaConfig, req.commentId, req.message);
            results.push({ channel: label, code: req.channel, commentId: req.commentId, replyId });
          } else if (req.channel === POST_ON_INSTAGRAM) {
            const metaConfig = this.config.meta;
            if (!metaConfig?.pageAccessToken || !req.commentId) {
              skipped.push({ channel: label, code: req.channel, error: "Meta Instagram config or commentId missing" });
              continue;
            }
            const { replyId } = await instagramReplyToComment(metaConfig, req.commentId, req.message);
            results.push({ channel: label, code: req.channel, commentId: req.commentId, replyId });
          } else if (req.channel === POST_ON_LINKEDIN) {
            const linkedInConfig = this.config.linkedin;
            if (!linkedInConfig?.accessToken || !req.postId) {
              skipped.push({ channel: label, code: req.channel, error: "LinkedIn config or postId missing" });
              continue;
            }
            const { replyId } = await linkedInReplyToComment(
              linkedInConfig,
              req.postId,
              req.message,
              req.commentId
            );
            results.push({ channel: label, code: req.channel, commentId: req.commentId, replyId });
          } else if (req.channel === POST_ON_THREADS) {
            const threadsConfig = this.config.threads;
            if (!threadsConfig?.userId || !threadsConfig?.accessToken || !req.postId) {
              skipped.push({ channel: label, code: req.channel, error: "Threads config or postId missing" });
              continue;
            }
            const { replyId } = await threadsReplyToPost(threadsConfig, req.postId, req.message);
            results.push({ channel: label, code: req.channel, replyId });
          } else {
            skipped.push({ channel: label, code: req.channel, error: "Unknown channel" });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ channel: label, code: req.channel, error: msg });
        }
      }
    }

    const failedCount = failed.length;
    const batchStatus: ReplyToCommentsResult["batchStatus"] =
      failedCount === 0 ? "full" : results.length === 0 ? "failed" : "partial";

    return { results, failed, skipped, batchStatus };
  }

  /**
   * Create and optionally start a Meta ad. Requires config.meta and adAccountId.
   * @param params - The RunMetaAdsParams object.
   * @returns The RunMetaAdsResult object.
   */
  async runMetaAds(params: RunMetaAdsParams): Promise<RunMetaAdsResult> {
    const metaConfig = this.config.meta;
    if (!metaConfig?.pageAccessToken || !metaConfig?.pageId) {
      return {
        campaignId: "",
        adSetId: "",
        adId: "",
        status: "PAUSED",
        error: "Meta config missing (pageAccessToken, pageId)",
      };
    }
    if (!metaConfig.adAccountId?.trim()) {
      return {
        campaignId: "",
        adSetId: "",
        adId: "",
        status: "PAUSED",
        error: "Meta adAccountId is required for runMetaAds",
      };
    }
    try {
      const result = await metaRunMetaAds(metaConfig, {
        content: params.content,
        imageUrl: params.imageUrl,
        targeting: params.targeting,
        dailyBudget: params.dailyBudget,
        campaignName: params.campaignName,
        adSetName: params.adSetName,
        startImmediately: params.startImmediately,
      });
      return { ...result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        campaignId: "",
        adSetId: "",
        adId: "",
        status: "PAUSED",
        error: msg,
      };
    }
  }

  /**
   * Delete a post on the given channel. Instagram does not support delete; returns success: false with error.
   * @param params - The DeletePostParams object.
   * @returns The DeletePostResult object.
   */
  async deletePost(params: DeletePostParams): Promise<DeletePostResult> {
    const { channel, postId } = params;
    try {
      if (channel === POST_ON_FACEBOOK) {
        const metaConfig = this.config.meta;
        if (!metaConfig?.pageAccessToken) {
          return { success: false, error: "Meta config missing" };
        }
        await metaDeletePost(metaConfig, postId);
        return { success: true };
      }
      if (channel === POST_ON_INSTAGRAM) {
        try {
          instagramDeletePost(this.config.meta!, postId);
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
      if (channel === POST_ON_LINKEDIN) {
        const linkedInConfig = this.config.linkedin;
        if (!linkedInConfig?.accessToken) {
          return { success: false, error: "LinkedIn config missing" };
        }
        await linkedInDeletePost(linkedInConfig, postId);
        return { success: true };
      }
      if (channel === POST_ON_THREADS) {
        const threadsConfig = this.config.threads;
        if (!threadsConfig?.accessToken) {
          return { success: false, error: "Threads config missing" };
        }
        await threadsDeletePost(threadsConfig, postId);
        return { success: true };
      }
      return { success: false, error: "Unknown channel" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
