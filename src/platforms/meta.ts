import type { MetaConfig, MetaTargeting } from "../types.js";
import { fetchWithTimeout, throwIfNotOk, parseJson, SocialPostingError } from "../lib/request.js";

const META_BASE = "https://graph.facebook.com/v24.0";

interface MetaErrorPayload {
  error?: { message?: string; error_user_msg?: string };
}

interface MetaPublishPhotoResult {
  post_id?: string;
  id?: string;
}

interface MetaTargetingSpec {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations: Record<string, unknown>;
  interests?: Array<{ id: string; name?: string }>;
  behaviors?: Array<{ id: string; name?: string }>;
  publisher_platforms?: string[];
  facebook_positions?: string[];
}

function toMetaTargetingSpec(t: MetaTargeting): MetaTargetingSpec {
  const geo: Record<string, unknown> = {};
  if (t.countries?.length) geo.countries = t.countries;
  if (t.regions?.length) geo.regions = t.regions;
  if (t.cities?.length) {
    geo.cities = t.cities.map((c) => ({
      key: c.key,
      radius: c.radius,
      distance_unit: c.distance_unit,
    }));
  }
  if (t.zips?.length) geo.zips = t.zips;
  if (t.customLocations?.length) {
    geo.custom_locations = t.customLocations.map((loc) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      address_string: loc.address_string,
      radius: loc.radius,
      distance_unit: loc.distance_unit,
    }));
  }
  if (Object.keys(geo).length === 0) geo.countries = ["US"];
  return {
    age_min: t.ageMin,
    age_max: t.ageMax,
    genders: t.genders,
    geo_locations: geo,
    interests: t.interests,
    behaviors: t.behaviors,
    publisher_platforms: t.publisherPlatforms ?? ["facebook", "instagram"],
    facebook_positions: ["feed"],
  };
}

export interface MetaPostResult {
  postId: string;
  permalink?: string;
}

/** Raw post from Graph API for getPageRecentPosts. */
export interface MetaPagePost {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
}

/** Raw comment from Graph API for getPostComments. */
export interface MetaComment {
  id: string;
  message?: string;
  from?: { name?: string };
  created_time?: string;
  comment_count?: number;
}

/**
 * Fetch recent posts from a Facebook Page.
 * Tries /feed first; if that fails with permission or "does not exist", falls back to /published_posts.
 * @param config - The Meta config object.
 * @param limit - The limit of posts to fetch.
 * @returns The recent posts.
 */
export async function getPageRecentPosts(
  config: MetaConfig,
  limit: number = 10
): Promise<MetaPagePost[]> {
  if (!config.pageAccessToken?.trim() || !config.pageId?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken and pageId are required");
  }
  const params: Record<string, string> = {
    fields: "id,message,created_time,permalink_url",
    limit: String(Math.min(100, Math.max(1, limit))),
    access_token: config.pageAccessToken,
  };
  const q = new URLSearchParams(params).toString();

  const tryEndpoint = async (path: string): Promise<MetaPagePost[]> => {
    const res = await fetchWithTimeout(`${META_BASE}/${config.pageId!}/${path}?${q}`);
    const text = await res.text();
    throwIfNotOk(res, text, "Meta");
    const data = parseJson<{ data?: MetaPagePost[] }>(text, {}, "Meta");
    return data.data ?? [];
  };

  try {
    return await tryEndpoint("feed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const tryPublished = /does not exist|cannot be loaded due to missing permissions|Unsupported get request|does not support this operation|#100/i.test(msg);
    if (!tryPublished) throw err;
    try {
      return await tryEndpoint("published_posts");
    } catch {
      throw err;
    }
  }
}

/**
 * Fetch comments on a Facebook post (or photo).
 * @param config - The Meta config object.
 * @param postId - The ID of the post to fetch comments for.
 * @param limit - The limit of comments to fetch.
 * @returns The comments on the post.
 */
export async function getPostComments(
  config: MetaConfig,
  postId: string,
  limit: number = 20
): Promise<MetaComment[]> {
  if (!config.pageAccessToken?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken is required");
  }
  const url = `${META_BASE}/${postId}/comments`;
  const params: Record<string, string> = {
    fields: "id,message,from,created_time,comment_count",
    limit: String(Math.min(100, Math.max(1, limit))),
    access_token: config.pageAccessToken,
  };
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(`${url}?${q}`);
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<{ data?: MetaComment[] }>(text, {}, "Meta");
  return data.data ?? [];
}

/**
 * Reply to a comment on Facebook.
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
    throw new SocialPostingError("Meta pageAccessToken is required");
  }
  const form = new URLSearchParams();
  form.set("message", message);
  form.set("access_token", config.pageAccessToken);
  const url = `${META_BASE}/${commentId}/comments`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<{ id?: string }>(text, {}, "Meta");
  if (!data.id) throw new SocialPostingError("Meta did not return reply id");
  return { replyId: data.id };
}

/**
 * Delete a Facebook post (photo object).
 * @param config - The Meta config object.
 * @param postId - The ID of the post to delete.
 * @returns Never.
 */
export async function deletePost(config: MetaConfig, postId: string): Promise<void> {
  if (!config.pageAccessToken?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken is required");
  }
  const url = `${META_BASE}/${postId}?access_token=${encodeURIComponent(config.pageAccessToken)}`;
  const res = await fetchWithTimeout(url, { method: "DELETE" });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
}

/**
 * Post to Facebook Page (photo with caption). Optionally create an ad.
 * @param config - The Meta config object.
 * @param params - The parameters for the Facebook post.
 * @returns The result of the Facebook post.
 */
export async function postToMeta(
  config: MetaConfig,
  params: {
    content: string;
    imageUrl: string;
    targeting?: MetaTargeting;
    createAd?: boolean;
    dailyBudget?: number;
    campaignName?: string;
    adSetName?: string;
  }
): Promise<MetaPostResult> {
  if (!config.pageAccessToken?.trim()) {
    throw new SocialPostingError("Meta pageAccessToken is required");
  }
  if (!config.pageId?.trim()) {
    throw new SocialPostingError("Meta pageId is required");
  }

  const form = new URLSearchParams();
  form.set("url", params.imageUrl);
  form.set("caption", params.content);
  form.set("access_token", config.pageAccessToken);

  const url = `${META_BASE}/${config.pageId}/photos`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<MetaPublishPhotoResult>(text, { id: "", post_id: "" }, "Meta");
  const postId = data.post_id ?? data.id ?? "";
  if (!postId) {
    throw new SocialPostingError("Meta did not return post id", { details: text.slice(0, 200) });
  }

  let permalink: string | undefined = config.pageId && postId
    ? `https://www.facebook.com/${config.pageId}/posts/${postId}`
    : undefined;
  try {
    const permRes = await fetchWithTimeout(`${META_BASE}/${postId}`, {
      method: "GET",
      params: { fields: "permalink_url", access_token: config.pageAccessToken },
    });
    const permText = await permRes.text();
    if (permRes.ok) {
      const permData = parseJson<{ permalink_url?: string }>(permText, {}, "Meta permalink");
      if (permData.permalink_url) permalink = permData.permalink_url;
    }
  } catch {
    // Non-fatal; keep constructed permalink or undefined
  }

  if (params.createAd && params.targeting && params.dailyBudget != null && config.adAccountId) {
    try {
      await createMetaAd(config, {
        postId,
        pageId: config.pageId,
        imageUrl: params.imageUrl,
        message: params.content,
        targeting: params.targeting,
        dailyBudget: params.dailyBudget,
        campaignName: params.campaignName,
        adSetName: params.adSetName,
        status: "PAUSED",
      });
    } catch (err) {
      // Organic post succeeded; ad creation is best-effort. Caller can check.
      throw err;
    }
  }

  return { postId, permalink };
}

async function createMetaAd(
  config: MetaConfig,
  params: {
    postId: string;
    pageId: string;
    imageUrl: string;
    message: string;
    targeting: MetaTargeting;
    dailyBudget: number;
    campaignName?: string;
    adSetName?: string;
    status?: "ACTIVE" | "PAUSED";
  }
): Promise<void> {
  const accountId = config.adAccountId!.startsWith("act_")
    ? config.adAccountId!
    : `act_${config.adAccountId!}`;
  const token = config.pageAccessToken;
  const status = params.status ?? "PAUSED";

  const { imageHash } = await uploadMetaAdImage(accountId, token, params.imageUrl);
  const campaignName = params.campaignName ?? `Campaign ${Date.now()}`;
  const adSetName = params.adSetName ?? `AdSet ${Date.now()}`;

  const { campaignId } = await createMetaCampaign(accountId, token, campaignName, status);
  const targeting = toMetaTargetingSpec(params.targeting);
  const { adSetId } = await createMetaAdSet(accountId, token, {
    campaignId,
    name: adSetName,
    dailyBudget: params.dailyBudget,
    targeting,
    pageId: params.pageId,
    status,
  });
  const { creativeId } = await createMetaAdCreative(accountId, token, {
    pageId: params.pageId,
    imageHash,
    message: params.message,
  });
  await createMetaAdRecord(accountId, token, adSetId, creativeId, adSetName, status);
}

/**
 * Create and optionally start a Meta ad (campaign + ad set + creative + ad).
 * Returns campaign, ad set, and ad ids plus status.
 * @param config - The Meta config object.
 * @param params - The parameters for the Meta ad.
 * @returns The result of the Meta ad.
 */
export async function runMetaAds(
  config: MetaConfig,
  params: {
    content: string;
    imageUrl: string;
    targeting: MetaTargeting;
    dailyBudget: number;
    campaignName?: string;
    adSetName?: string;
    startImmediately?: boolean;
  }
): Promise<{ campaignId: string; adSetId: string; adId: string; status: "ACTIVE" | "PAUSED" }> {
  if (!config.adAccountId?.trim()) {
    throw new SocialPostingError("Meta adAccountId is required for runMetaAds");
  }
  const accountId = config.adAccountId.startsWith("act_")
    ? config.adAccountId
    : `act_${config.adAccountId}`;
  const token = config.pageAccessToken;
  if (!token?.trim()) throw new SocialPostingError("Meta pageAccessToken is required");
  const status = params.startImmediately ? "ACTIVE" : "PAUSED";

  const { imageHash } = await uploadMetaAdImage(accountId, token, params.imageUrl);
  const campaignName = params.campaignName ?? `Campaign ${Date.now()}`;
  const adSetName = params.adSetName ?? `AdSet ${Date.now()}`;

  const { campaignId } = await createMetaCampaign(accountId, token, campaignName, status);
  const targeting = toMetaTargetingSpec(params.targeting);
  const { adSetId } = await createMetaAdSet(accountId, token, {
    campaignId,
    name: adSetName,
    dailyBudget: params.dailyBudget,
    targeting,
    pageId: config.pageId,
    status,
  });
  const { creativeId } = await createMetaAdCreative(accountId, token, {
    pageId: config.pageId,
    imageHash,
    message: params.content,
  });
  const { adId } = await createMetaAdRecordAndReturnId(
    accountId,
    token,
    adSetId,
    creativeId,
    adSetName,
    status
  );
  return { campaignId, adSetId, adId, status };
}

/**
 * Upload an image to Meta for an ad.
 * @param accountId - The ID of the Meta ad account.
 * @param accessToken - The access token for the Meta ad account.
 * @param imageUrl - The URL of the image to upload.
 * @returns The hash of the uploaded image.
 */
async function uploadMetaAdImage(
  accountId: string,
  accessToken: string,
  imageUrl: string
): Promise<{ imageHash: string }> {
  const form = new URLSearchParams();
  form.set("url", imageUrl);
  form.set("access_token", accessToken);
  const url = `${META_BASE}/${accountId}/adimages`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<{ images?: Record<string, { hash: string }> }>(text, {}, "Meta");
  const firstKey = data.images && Object.keys(data.images)[0];
  const imageHash = firstKey ? data.images![firstKey].hash : "";
  if (!imageHash) throw new SocialPostingError("Meta did not return image hash");
  return { imageHash };
}

/**
 * Create a Meta campaign.
 * @param accountId - The ID of the Meta ad account.
 * @param accessToken - The access token for the Meta ad account.
 * @param name - The name of the campaign.
 * @param status - The status of the campaign.
 * @returns The result of the Meta campaign.
 */
async function createMetaCampaign(
  accountId: string,
  accessToken: string,
  name: string,
  status: "ACTIVE" | "PAUSED" = "PAUSED"
): Promise<{ campaignId: string }> {
  const form = new URLSearchParams();
  form.set("name", name);
  form.set("objective", "OUTCOME_ENGAGEMENT");
  form.set("status", status);
  form.set("access_token", accessToken);
  const url = `${META_BASE}/${accountId}/campaigns`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<{ id?: string }>(text, {}, "Meta");
  if (!data.id) throw new SocialPostingError("Meta did not return campaign id");
  return { campaignId: data.id };
}

/**
 * Create a Meta ad set.
 * @param accountId - The ID of the Meta ad account.
 * @param accessToken - The access token for the Meta ad account.
 * @param params - The parameters for the Meta ad set.
 * @returns The result of the Meta ad set.
 */
async function createMetaAdSet(
  accountId: string,
  accessToken: string,
  params: {
    campaignId: string;
    name: string;
    dailyBudget: number;
    targeting: MetaTargetingSpec;
    pageId: string;
    status?: "ACTIVE" | "PAUSED";
  }
): Promise<{ adSetId: string }> {
  const form = new URLSearchParams();
  form.set("campaign_id", params.campaignId);
  form.set("name", params.name);
  form.set("daily_budget", String(params.dailyBudget));
  form.set("targeting", JSON.stringify(params.targeting));
  form.set("promoted_object", JSON.stringify({ page_id: params.pageId }));
  form.set("status", params.status ?? "PAUSED");
  form.set("billing_event", "IMPRESSIONS");
  form.set("optimization_goal", "REACH");
  form.set("access_token", accessToken);
  const url = `${META_BASE}/${accountId}/adsets`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<{ id?: string }>(text, {}, "Meta");
  if (!data.id) throw new SocialPostingError("Meta did not return ad set id");
  return { adSetId: data.id };
}

/**
 * Create a Meta ad creative.
 * @param accountId - The ID of the Meta ad account.
 * @param accessToken - The access token for the Meta ad account.
 * @param params - The parameters for the Meta ad creative.
 * @returns The result of the Meta ad creative.
 */
async function createMetaAdCreative(
  accountId: string,
  accessToken: string,
  params: { pageId: string; imageHash: string; message: string }
): Promise<{ creativeId: string }> {
  const objectStorySpec = {
    page_id: params.pageId,
    photo_data: { image_hash: params.imageHash, caption: params.message },
  };
  const form = new URLSearchParams();
  form.set("name", `Creative ${params.message.slice(0, 50)}`);
  form.set("object_story_spec", JSON.stringify(objectStorySpec));
  form.set("access_token", accessToken);
  const url = `${META_BASE}/${accountId}/adcreatives`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<{ id?: string }>(text, {}, "Meta");
  if (!data.id) throw new SocialPostingError("Meta did not return creative id");
  return { creativeId: data.id };
}

/**
 * Create a Meta ad record.
 * @param accountId - The ID of the Meta ad account.
 * @param accessToken - The access token for the Meta ad account.
 * @param adSetId - The ID of the Meta ad set.
 * @param creativeId - The ID of the Meta ad creative.
 * @param name - The name of the ad.
 * @param status - The status of the ad.
 * @returns The result of the Meta ad record.
 */
async function createMetaAdRecord(
  accountId: string,
  accessToken: string,
  adSetId: string,
  creativeId: string,
  name: string,
  status: "ACTIVE" | "PAUSED" = "PAUSED"
): Promise<void> {
  const form = new URLSearchParams();
  form.set("adset_id", adSetId);
  form.set("creative", JSON.stringify({ creative_id: creativeId }));
  form.set("name", name);
  form.set("status", status);
  form.set("access_token", accessToken);
  const url = `${META_BASE}/${accountId}/ads`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
}

/**
 * Create a Meta ad record and return the ID.
 * @param accountId - The ID of the Meta ad account.
 * @param accessToken - The access token for the Meta ad account.
 * @param adSetId - The ID of the Meta ad set.
 * @param creativeId - The ID of the Meta ad creative.
 * @param name - The name of the ad.
 * @param status - The status of the ad.
 * @returns The result of the Meta ad record.
 */
async function createMetaAdRecordAndReturnId(
  accountId: string,
  accessToken: string,
  adSetId: string,
  creativeId: string,
  name: string,
  status: "ACTIVE" | "PAUSED" = "PAUSED"
): Promise<{ adId: string }> {
  const form = new URLSearchParams();
  form.set("adset_id", adSetId);
  form.set("creative", JSON.stringify({ creative_id: creativeId }));
  form.set("name", name);
  form.set("status", status);
  form.set("access_token", accessToken);
  const url = `${META_BASE}/${accountId}/ads`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  throwIfNotOk(res, text, "Meta");
  const data = parseJson<{ id?: string }>(text, {}, "Meta");
  if (!data.id) throw new SocialPostingError("Meta did not return ad id");
  return { adId: data.id };
}
