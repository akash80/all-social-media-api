import type { MetaConfig } from "../types.js";
import { fetchWithTimeout, throwIfNotOk, parseJson, SocialPostingError } from "../lib/request.js";

const META_BASE = "https://graph.facebook.com/v24.0";
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_WAIT_MS = 30000;

export interface InstagramPostResult {
  postId: string;
  /** Permalink to open the post in a browser (when available). */
  permalink?: string;
}

/**
 * Post to Instagram (create media container, poll until FINISHED, then publish).
 * Uses the same Page Access Token as Meta; requires instagramBusinessAccountId.
 * @param config - The Meta config object.
 * @param params - The parameters for the Instagram post.
 * @returns The result of the Instagram post.
 */
export async function postToInstagram(
  config: MetaConfig,
  params: { content: string; imageUrl: string }
): Promise<InstagramPostResult> {
  if (!config.pageAccessToken?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken is required for Instagram");
  }
  const igUserId = config.instagramBusinessAccountId?.trim();
  if (!igUserId) {
    throw new SocialPostingError("Meta instagramBusinessAccountId is required for Instagram");
  }

  const form = new URLSearchParams();
  form.set("access_token", config.pageAccessToken);
  form.set("image_url", params.imageUrl);
  form.set("media_type", "IMAGE");
  if (params.content?.trim()) form.set("caption", params.content.trim());

  const url = `${META_BASE}/${igUserId}/media`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Instagram");
  const data = parseJson<{ id?: string }>(text, {}, "Instagram");
  if (!data.id) {
    throw new SocialPostingError("Instagram did not return container id", {
      details: text.slice(0, 200),
    });
  }
  const creationId = data.id;

  const token = config.pageAccessToken;
  const deadline = Date.now() + POLL_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const statusRes = await fetchWithTimeout(`${META_BASE}/${creationId}`, {
      method: "GET",
      params: { fields: "status_code", access_token: token },
    });
    const statusText = await statusRes.text();
    throwIfNotOk(statusRes, statusText, "Instagram");
    const statusData = parseJson<{ status_code?: string }>(statusText, {}, "Instagram");
    const statusCode = statusData.status_code ?? "UNKNOWN";
    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") break;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new SocialPostingError(`Instagram container ${statusCode}`, {
        details: statusText.slice(0, 200),
      });
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const publishForm = new URLSearchParams();
  publishForm.set("access_token", token);
  publishForm.set("creation_id", creationId);
  const publishUrl = `${META_BASE}/${igUserId}/media_publish`;
  const publishRes = await fetchWithTimeout(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishForm.toString(),
  });
  const publishText = await publishRes.text();
  throwIfNotOk(publishRes, publishText, "Instagram");
  const publishData = parseJson<{ id?: string }>(publishText, {}, "Instagram");
  if (!publishData.id) {
    throw new SocialPostingError("Instagram did not return media id", {
      details: publishText.slice(0, 200),
    });
  }
  const mediaId = publishData.id;
  let permalink: string | undefined;
  await new Promise((r) => setTimeout(r, 1500)); // allow API to populate permalink after publish
  try {
    const permRes = await fetchWithTimeout(`${META_BASE}/${mediaId}`, {
      method: "GET",
      params: { fields: "permalink", access_token: token },
    });
    const permText = await permRes.text();
    if (permRes.ok) {
      const permData = parseJson<{ permalink?: string }>(permText, {}, "Instagram permalink");
      if (permData.permalink) permalink = permData.permalink;
    }
  } catch {
    // Non-fatal; post succeeded, we just don't have the link
  }
  return { postId: mediaId, permalink };
}

/** Raw media item from Instagram Graph API. */
export interface InstagramMediaItem {
  id: string;
  caption?: string;
  timestamp?: string;
  permalink?: string;
  media_type?: string;
}

/**
 * Fetch recent media (posts) from an Instagram Business account.
 * @param config - The Meta config object.
 * @param limit - The limit of media to fetch.
 * @returns The recent media items.
 */
export async function getUserMedia(
  config: MetaConfig,
  limit: number = 10
): Promise<InstagramMediaItem[]> {
  if (!config.pageAccessToken?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken is required for Instagram");
  }
  const igUserId = config.instagramBusinessAccountId?.trim();
  if (!igUserId) {
    throw new SocialPostingError("Meta instagramBusinessAccountId is required for Instagram");
  }
  const url = `${META_BASE}/${igUserId}/media`;
  const params: Record<string, string> = {
    fields: "id,caption,timestamp,permalink,media_type",
    limit: String(Math.min(50, Math.max(1, limit))),
    access_token: config.pageAccessToken,
  };
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${url}?${q}`);
  const text = await res.text();
  throwIfNotOk(res, text, "Instagram");
  const data = parseJson<{ data?: InstagramMediaItem[] }>(text, {}, "Instagram");
  return data.data ?? [];
}

/** Raw comment from Instagram Graph API. */
export interface InstagramComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
}

/**
 * Fetch comments on an Instagram media post.
 * @param config - The Meta config object.
 * @param mediaId - The ID of the media post.
 * @param limit - The limit of comments to fetch.
 * @returns The comments on the media post.
 */
export async function getMediaComments(
  config: MetaConfig,
  mediaId: string,
  limit: number = 20
): Promise<InstagramComment[]> {
  if (!config.pageAccessToken?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken is required for Instagram");
  }
  const url = `${META_BASE}/${mediaId}/comments`;
  const params: Record<string, string> = {
    fields: "id,text,username,timestamp,like_count",
    limit: String(Math.min(100, Math.max(1, limit))),
    access_token: config.pageAccessToken,
  };
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${url}?${q}`);
  const text = await res.text();
  throwIfNotOk(res, text, "Instagram");
  const data = parseJson<{ data?: InstagramComment[] }>(text, {}, "Instagram");
  return data.data ?? [];
}

/**
 * Reply to a comment on Instagram.
 * @param config - The Meta config object.
 * @param commentId - The ID of the comment to reply to.
 * @param message - The message to reply with.
 * @returns The result of the reply.
 */
export async function replyToComment(
  config: MetaConfig,
  commentId: string,
  message: string
): Promise<{ replyId: string }> {
  if (!config.pageAccessToken?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken is required for Instagram");
  }
  const form = new URLSearchParams();
  form.set("message", message);
  form.set("access_token", config.pageAccessToken);
  const url = `${META_BASE}/${commentId}/replies`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Instagram");
  const data = parseJson<{ id?: string }>(text, {}, "Instagram");
  if (!data.id) throw new SocialPostingError("Instagram did not return reply id");
  return { replyId: data.id };
}

/**
 * Instagram does not support deleting posts via API. Throws if called.
 * @param _config - The Meta config object.
 * @param _postId - The ID of the post to delete.
 * @returns Never.
 */
export function deletePost(_config: MetaConfig, _postId: string): never {
  throw new SocialPostingError("Instagram does not support deleting posts via API");
}
