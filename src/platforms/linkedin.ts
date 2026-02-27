import type { LinkedInConfig } from "../types.js";
import { fetchWithTimeout, throwIfNotOk, parseJson, SocialPostingError } from "../lib/request.js";

const LINKEDIN_BASE = "https://api.linkedin.com/v2";
const UPLOAD_TIMEOUT_MS = 120000;

export interface LinkedInPostResult {
  postId: string;
  permalink?: string;
}

/**
 * Post to LinkedIn (UGC Post API). Text-only or with image URL.
 * The client resolves imageBuffer to imageUrl via uploadImage before calling this.
 */
export async function postToLinkedIn(
  config: LinkedInConfig,
  params: {
    content: string;
    imageUrl?: string;
    visibility?: "PUBLIC" | "CONNECTIONS";
  }
): Promise<LinkedInPostResult> {
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("LinkedIn accessToken is required");
  }
  const authorUrn = config.personUrn?.trim() ?? config.organizationUrn?.trim();
  if (!authorUrn) {
    throw new SocialPostingError(
      "LinkedIn personUrn or organizationUrn is required"
    );
  }

  let imageAssetUrn: string | undefined;
  if (params.imageUrl?.trim()) {
    imageAssetUrn = await linkedInImageFromUrl(
      config.accessToken,
      authorUrn,
      params.imageUrl
    );
  }

  const visibility = params.visibility ?? "PUBLIC";
  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: params.content },
    shareMediaCategory: imageAssetUrn ? "IMAGE" : "NONE",
  };
  if (imageAssetUrn) {
    shareContent.media = [
      {
        media: imageAssetUrn,
        status: "READY",
        title: { attributes: [], text: "" },
      },
    ];
  }
  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": shareContent,
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": visibility,
    },
  };

  const res = await fetchWithTimeout(`${LINKEDIN_BASE}/ugcPosts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const textBody = await res.text();
  throwIfNotOk(res, textBody, "LinkedIn");

  let postId: string | undefined;
  try {
    const data = parseJson<{ id?: string }>(textBody, {}, "LinkedIn");
    if (data.id && typeof data.id === "string") postId = data.id;
  } catch {
    // ignore
  }
  if (!postId) {
    const headerId = res.headers.get("x-restli-id") ?? res.headers.get("id");
    if (headerId && typeof headerId === "string") postId = headerId;
  }
  if (!postId && res.headers.get("location")) {
    const location = res.headers.get("location")!;
    const match =
      location.match(/ugcPosts\/(urn:li:[^/]+)/) ||
      location.match(/(urn:li:\w+:\d+)/);
    if (match?.[1]) postId = match[1];
  }
  if (!postId) {
    throw new SocialPostingError("LinkedIn did not return post id", {
      details: textBody.slice(0, 200),
    });
  }

  const permalink = postId.startsWith("urn:")
    ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`
    : undefined;
  return { postId, permalink };
}

async function linkedInImageFromUrl(
  accessToken: string,
  ownerUrn: string,
  imageUrl: string
): Promise<string> {
  const registerBody = {
    registerUploadRequest: {
      owner: ownerUrn,
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
    },
  };
  const regRes = await fetchWithTimeout(
    `${LINKEDIN_BASE}/assets?action=registerUpload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(registerBody),
    }
  );
  const regText = await regRes.text();
  throwIfNotOk(regRes, regText, "LinkedIn");
  const regData = parseJson<{
    value?: {
      asset?: string;
      uploadMechanism?: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
          uploadUrl?: string;
        };
      };
    };
  }>(regText, {}, "LinkedIn");
  const asset = regData.value?.asset;
  const uploadUrl =
    regData.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  if (!asset || !uploadUrl) {
    throw new SocialPostingError(
      "LinkedIn registerUpload did not return asset or uploadUrl",
      { details: regText.slice(0, 300) }
    );
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new SocialPostingError(
      `Failed to fetch image from URL: ${imageRes.status}`,
      { details: imageUrl }
    );
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  const putRes = await fetchWithTimeout(
    uploadUrl,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(imageBuffer),
      timeoutMs: UPLOAD_TIMEOUT_MS,
    }
  );
  if (!putRes.ok) {
    const putText = await putRes.text();
    throw new SocialPostingError(
      `LinkedIn image upload failed: ${putRes.status}`,
      { details: putText.slice(0, 300) }
    );
  }
  return asset;
}

const LINKEDIN_REST_BASE = "https://api.linkedin.com/rest";

/** Minimal post shape for getRecentPosts (Posts API or UGC). */
export interface LinkedInPostItem {
  id: string;
  commentary?: string;
  createdAt?: number;
  permalink?: string;
}

/**
 * Fetch recent posts by the configured author (person or org).
 * Uses LinkedIn REST Posts API when available.
 * @param config - The LinkedIn config object.
 * @param limit - The limit of posts to fetch.
 * @returns The recent posts.
 */
export async function getRecentPosts(
  config: LinkedInConfig,
  limit: number = 10
): Promise<LinkedInPostItem[]> {
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("LinkedIn accessToken is required");
  }
  const authorUrn = config.personUrn?.trim() ?? config.organizationUrn?.trim();
  if (!authorUrn) {
    throw new SocialPostingError("LinkedIn personUrn or organizationUrn is required");
  }
  const url = `${LINKEDIN_REST_BASE}/posts?author=${encodeURIComponent(authorUrn)}&count=${Math.min(100, Math.max(1, limit))}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202301",
      Authorization: `Bearer ${config.accessToken}`,
    },
  });
  const text = await res.text();
  if (res.status === 404) {
    return [];
  }
  throwIfNotOk(res, text, "LinkedIn");
  const data = parseJson<{ elements?: Array<{ id: string; commentary?: string; createdAt?: number; permalink?: string }> }>(
    text,
    {},
    "LinkedIn"
  );
  const elements = data.elements ?? [];
  return elements.map((el) => ({
    id: el.id,
    commentary: el.commentary,
    createdAt: el.createdAt,
    permalink: el.permalink,
  }));
}

/** Raw comment from LinkedIn Comments API. */
export interface LinkedInComment {
  id: string;
  message?: string;
  actor?: string;
  createdAt?: number;
}

/**
 * Fetch comments on a LinkedIn post.
 * Uses socialActions/comments or equivalent; postId may be URN format.
 * @param config - The LinkedIn config object.
 * @param postId - The ID of the post to fetch comments for.
 * @param limit - The limit of comments to fetch.
 * @returns The comments on the post.
 */
export async function getPostComments(
  config: LinkedInConfig,
  postId: string,
  limit: number = 20
): Promise<LinkedInComment[]> {
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("LinkedIn accessToken is required");
  }
  const url = `${LINKEDIN_BASE}/socialActions/${encodeURIComponent(postId)}/comments?count=${Math.min(100, Math.max(1, limit))}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "X-Restli-Protocol-Version": "2.0.0",
      Authorization: `Bearer ${config.accessToken}`,
    },
  });
  const text = await res.text();
  throwIfNotOk(res, text, "LinkedIn");
  const data = parseJson<{ elements?: Array<{ id: string; message?: { text?: string }; actor?: string; createdAt?: number }> }>(
    text,
    {},
    "LinkedIn"
  );
  const elements = data.elements ?? [];
  return elements.map((el) => ({
    id: el.id,
    message: typeof el.message === "object" && el.message?.text != null ? el.message.text : undefined,
    actor: el.actor,
    createdAt: el.createdAt,
  }));
}

/**
 * Create a comment (or reply) on a LinkedIn post.
 * @param config - The LinkedIn config object.
 * @param postId - The ID of the post to reply to.
 * @param message - The message to reply with.
 * @param parentCommentId - The ID of the parent comment to reply to.
 * @returns The result of the reply.
 */
export async function replyToComment(
  config: LinkedInConfig,
  postId: string,
  message: string,
  parentCommentId?: string
): Promise<{ replyId: string }> {
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("LinkedIn accessToken is required");
  }
  const body: Record<string, unknown> = {
    actor: config.personUrn ?? config.organizationUrn,
    message: { text: message },
    object: postId,
  };
  if (parentCommentId) body.parentComment = parentCommentId;
  const url = `${LINKEDIN_BASE}/socialActions/${encodeURIComponent(postId)}/comments`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "LinkedIn");
  const idHeader = res.headers.get("x-restli-id") ?? res.headers.get("id");
  if (!idHeader) throw new SocialPostingError("LinkedIn did not return comment id");
  return { replyId: idHeader };
}

/**
 * Delete a LinkedIn UGC post.
 * @param config - The LinkedIn config object.
 * @param postId - The ID of the post to delete.
 * @returns Never.
 */
export async function deletePost(config: LinkedInConfig, postId: string): Promise<void> {
  if (!config.accessToken?.trim()) {
    throw new SocialPostingError("LinkedIn accessToken is required");
  }
  const url = `${LINKEDIN_BASE}/ugcPosts/${encodeURIComponent(postId)}`;
  const res = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: {
      "X-Restli-Protocol-Version": "2.0.0",
      Authorization: `Bearer ${config.accessToken}`,
    },
  });
  const text = await res.text();
  throwIfNotOk(res, text, "LinkedIn");
}
