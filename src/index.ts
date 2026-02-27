/**
 * all-social-media-api – Cross-post to Facebook, Instagram, LinkedIn, and Threads.
 * @author Akash Arora
 * @license MIT
 */

export { SocialPostingClient, type CrossPostProgressCallbacks } from "./client.js";
export { SocialPostingError } from "./lib/request.js";
export type {
  PlatformCode,
  SocialPostingConfig,
  MetaConfig,
  LinkedInConfig,
  ThreadsConfig,
  CrossPostParams,
  CrossPostResult,
  PlatformResult,
  UploadImage,
  UploadImageHint,
  ContentAdapter,
  MetaTargeting,
  Comment,
  PostWithComments,
  GetRecentPostsParams,
  GetRecentPostsResult,
  ReplyRequest,
  ReplyResult,
  ReplyToCommentsResult,
  RunMetaAdsParams,
  RunMetaAdsResult,
  DeletePostParams,
  DeletePostResult,
} from "./types.js";
