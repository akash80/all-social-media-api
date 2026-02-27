import type { ThreadsConfig } from "../types.js";
import { fetchWithTimeout, throwIfNotOk, parseJson, SocialPostingError } from "../lib/request.js";

const THREADS_BASE = "https://graph.threads.net/v1.0";
const THREADS_TEXT_MAX_LENGTH = 500;

export interface ThreadsPostResult {
  postId: string;
  /** Direct link to open the thread in a browser (when available). */
  permalink?: string;
}

/**
 * Post to Threads (create container, then publish if image; text-only is published inline when auto_publish_text).
 */
export async function postToThreads(
  config: ThreadsConfig,
  params: {
    content: string;
    imageUrl?: string;
    altText?: string;
    linkAttachment?: string;
  }
): Promise<ThreadsPostResult> {
  if (!config.userId?.trim()) {
    throw new SocialPostingError("Threads userId is required");
  }
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("Threads accessToken is required");
  }

  const text = params.content?.trim() ?? "";
  if (!text && !params.imageUrl?.trim()) {
    throw new SocialPostingError("Threads post requires content or image");
  }
  if (text.length > THREADS_TEXT_MAX_LENGTH) {
    throw new SocialPostingError(
      `Threads post text cannot exceed ${THREADS_TEXT_MAX_LENGTH} characters`
    );
  }

  const mediaType = params.imageUrl?.trim() ? "IMAGE" : "TEXT";
  const form = new URLSearchParams();
  form.set("access_token", config.accessToken);
  form.set("media_type", mediaType);
  if (text) form.set("text", text);
  if (params.imageUrl?.trim()) form.set("image_url", params.imageUrl.trim());
  if (params.altText?.trim()) form.set("alt_text", params.altText.trim());
  if (params.linkAttachment?.trim())
    form.set("link_attachment", params.linkAttachment.trim());
  if (mediaType === "TEXT") form.set("auto_publish_text", "true");

  const url = `${THREADS_BASE}/${config.userId}/threads`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const responseText = await res.text();
  throwIfNotOk(res, responseText, "Threads");
  const data = parseJson<{ id?: string }>(responseText, {}, "Threads");
  let containerId = data.id;

  if (mediaType === "IMAGE" && containerId) {
    const publishForm = new URLSearchParams();
    publishForm.set("access_token", config.accessToken);
    publishForm.set("creation_id", containerId);
    const publishUrl = `${THREADS_BASE}/${config.userId}/threads_publish`;
    const publishRes = await fetchWithTimeout(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishForm.toString(),
    });
    const publishText = await publishRes.text();
    throwIfNotOk(publishRes, publishText, "Threads");
    const publishData = parseJson<{ id?: string }>(publishText, {}, "Threads");
    if (publishData.id) containerId = publishData.id;
  }

  if (!containerId) {
    throw new SocialPostingError("Threads did not return media id", {
      details: responseText.slice(0, 200),
    });
  }
  let permalink: string | undefined = undefined;
  try {
    const permRes = await fetchWithTimeout(`${THREADS_BASE}/${containerId}`, {
      method: "GET",
      params: { fields: "permalink", access_token: config.accessToken },
    });
    const permText = await permRes.text();
    if (permRes.ok) {
      const permData = parseJson<{ permalink?: string }>(permText, {}, "Threads permalink");
      if (permData.permalink) permalink = permData.permalink;
    }
  } catch {
    // Non-fatal; post succeeded
  }
  return { postId: containerId, permalink };
}

/** Thread post item from Threads API. */
export interface ThreadsPostItem {
  id: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
  media_type?: string;
  username?: string;
}

/**
 * Fetch recent threads (posts) by the user.
 */
export async function getUserThreads(
  config: ThreadsConfig,
  limit: number = 10
): Promise<ThreadsPostItem[]> {
  if (!config.userId?.trim() || !config.accessToken?.trim()) {
    throw new SocialPostingError("Threads userId and accessToken are required");
  }
  const url = `${THREADS_BASE}/${config.userId}/threads`;
  const params: Record<string, string> = {
    fields: "id,text,timestamp,permalink,media_type,username",
    limit: String(Math.min(50, Math.max(1, limit))),
    access_token: config.accessToken,
  };
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${url}?${q}`);
  const text = await res.text();
  throwIfNotOk(res, text, "Threads");
  const data = parseJson<{ data?: ThreadsPostItem[] }>(text, {}, "Threads");
  return data.data ?? [];
}

/** Reply item from Threads API (replies = comments on posts). */
export interface ThreadsReplyItem {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  replied_to?: string;
}

/**
 * Fetch replies by the user (all replies the user has made).
 * @param config - The Threads config object.
 * @param limit - The limit of replies to fetch.
 * @returns The replies by the user.
 */
export async function getReplies(
  config: ThreadsConfig,
  limit: number = 20
): Promise<ThreadsReplyItem[]> {
  if (!config.userId?.trim() || !config.accessToken?.trim()) {
    throw new SocialPostingError("Threads userId and accessToken are required");
  }
  const url = `${THREADS_BASE}/${config.userId}/replies`;
  const params: Record<string, string> = {
    fields: "id,text,timestamp,username,replied_to",
    limit: String(Math.min(100, Math.max(1, limit))),
    access_token: config.accessToken,
  };
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${url}?${q}`);
  const text = await res.text();
  throwIfNotOk(res, text, "Threads");
  const data = parseJson<{ data?: ThreadsReplyItem[] }>(text, {}, "Threads");
  return data.data ?? [];
}

/**
 * Fetch replies (comments) on a specific Threads post.
 * Uses GET /{threads-media-id}/replies to get all top-level replies on that post.
 * @param config - The Threads config object.
 * @param postId - The ID of the post to fetch replies for.
 * @param limit - The limit of replies to fetch.
 * @returns The replies on the post.
 */
export async function getRepliesForPost(
  config: ThreadsConfig,
  postId: string,
  limit: number = 20
): Promise<ThreadsReplyItem[]> {
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("Threads accessToken is required");
  }
  const url = `${THREADS_BASE}/${postId}/replies`;
  const params: Record<string, string> = {
    fields: "id,text,timestamp,username",
    limit: String(Math.min(100, Math.max(1, limit))),
    access_token: config.accessToken,
  };
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${url}?${q}`);
  const text = await res.text();
  if (res.status === 404 || res.status === 400) {
    return [];
  }
  throwIfNotOk(res, text, "Threads");
  const data = parseJson<{ data?: ThreadsReplyItem[] }>(text, {}, "Threads");
  return data.data ?? [];
}

/**
 * Reply to a Threads post (create thread with reply_to_id, then publish).
 * @param config - The Threads config object.
 * @param postId - The ID of the post to reply to.
 * @param message - The message to reply with.
 * @returns The result of the reply.
 */
export async function replyToPost(
  config: ThreadsConfig,
  postId: string,
  message: string
): Promise<{ replyId: string }> {
  if (!config.userId?.trim() || !config.accessToken?.trim()) {
    throw new SocialPostingError("Threads userId and accessToken are required");
  }
  const text = message?.trim() ?? "";
  if (text.length > THREADS_TEXT_MAX_LENGTH) {
    throw new SocialPostingError(`Threads reply cannot exceed ${THREADS_TEXT_MAX_LENGTH} characters`);
  }
  const form = new URLSearchParams();
  form.set("access_token", config.accessToken);
  form.set("media_type", "TEXT");
  form.set("text", text);
  form.set("reply_to_id", postId);
  form.set("auto_publish_text", "true");

  const url = `${THREADS_BASE}/${config.userId}/threads`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const responseText = await res.text();
  throwIfNotOk(res, responseText, "Threads");
  const data = parseJson<{ id?: string }>(responseText, {}, "Threads");
  if (!data.id) throw new SocialPostingError("Threads did not return reply id");
  return { replyId: data.id };
}

/**
 * Delete a Threads post.
 * @param config - The Threads config object.
 * @param postId - The ID of the post to delete.
 * @returns Never.
 */
export async function deletePost(config: ThreadsConfig, postId: string): Promise<void> {
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("Threads accessToken is required");
  }
  const url = `${THREADS_BASE}/${postId}?access_token=${encodeURIComponent(config.accessToken)}`;
  const res = await fetchWithTimeout(url, { method: "DELETE" });
  const text = await res.text();
  throwIfNotOk(res, text, "Threads");
}
