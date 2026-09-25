import axios from "axios";

/**
 * Posts & Reels list for Comment Automation, with real page numbers.
 *
 * Meta's feed/media edges page with an opaque "after" cursor and give no
 * total, so page numbers can't come from them directly. Instead the ids of
 * the latest MAX_LISTED_POSTS posts are listed first (ids only — cheap, 100
 * per request), which gives the total and the page count; then only the
 * requested page's posts are fetched with their details in one ?ids= call.
 * The id list is cached briefly per account so moving between pages doesn't
 * re-list; page 1 always re-lists so a new post shows up.
 */
export const POSTS_PAGE_SIZE = 12;
export const MAX_LISTED_POSTS = 1000;
const ID_CACHE_MS = 2 * 60 * 1000;
const idCache = new Map(); // integrationId -> { at, ids, truncated }

const FB_FIELDS = "id,message,story,created_time,full_picture,permalink_url,shares";
const IG_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";

function edgeFor(integration, apiVersion) {
  const isInstagram = String(integration.platform || "").toUpperCase() === "INSTAGRAM";
  if (isInstagram && integration.ig_account_id) return { isInstagram, url: `https://graph.facebook.com/${apiVersion}/${integration.ig_account_id}/media` };
  if (!isInstagram && integration.fb_page_id) return { isInstagram, url: `https://graph.facebook.com/${apiVersion}/${integration.fb_page_id}/feed` };
  return null;
}

/** Newest-first ids of up to MAX_LISTED_POSTS posts. */
async function listPostIds(integration, apiVersion, { fresh = false } = {}) {
  const cached = idCache.get(integration.id);
  if (!fresh && cached && Date.now() - cached.at < ID_CACHE_MS) return cached;
  const edge = edgeFor(integration, apiVersion);
  if (!edge) return { ids: [], truncated: false };

  const ids = [];
  let after = null;
  let truncated = false;
  while (ids.length < MAX_LISTED_POSTS) {
    const res = await axios.get(edge.url, {
      params: { fields: "id", limit: 100, ...(after ? { after } : {}), access_token: integration.access_token },
      timeout: 10000,
    });
    for (const p of res.data?.data || []) if (p?.id) ids.push(p.id);
    after = res.data?.paging?.next ? res.data?.paging?.cursors?.after : null;
    if (!after) break;
    if (ids.length >= MAX_LISTED_POSTS) truncated = true;
  }
  const entry = { at: Date.now(), ids: ids.slice(0, MAX_LISTED_POSTS), truncated };
  idCache.set(integration.id, entry);
  return entry;
}

function normalize(p, isInstagram) {
  if (isInstagram) {
    return {
      id: p.id,
      message: p.caption || "No caption",
      picture: p.thumbnail_url || p.media_url || null,
      permalink: p.permalink || `https://instagram.com/p/${p.id}`,
      created_time: p.timestamp,
      likes_count: p.like_count || 0,
      comments_count: p.comments_count || 0,
      media_type: p.media_type,
      platform: "INSTAGRAM",
    };
  }
  return {
    id: p.id,
    message: p.message || p.story || "Facebook Post",
    picture: p.full_picture || null,
    permalink: p.permalink_url || `https://facebook.com/${p.id}`,
    created_time: p.created_time,
    likes_count: 0,
    comments_count: 0,
    shares_count: p.shares?.count || 0,
    platform: "FACEBOOK",
  };
}

/**
 * One page (1-based) of an account's posts: { posts, page, totalPages, total, truncated }.
 * A page past the end is clamped to the last page.
 */
export async function getPostsPage(integration, apiVersion, page = 1) {
  const edge = edgeFor(integration, apiVersion);
  if (!edge) return { posts: [], page: 1, totalPages: 0, total: 0, truncated: false };

  const wanted = Math.max(1, Math.floor(Number(page) || 1));
  const { ids, truncated } = await listPostIds(integration, apiVersion, { fresh: wanted === 1 });
  const totalPages = Math.ceil(ids.length / POSTS_PAGE_SIZE);
  const current = totalPages ? Math.min(wanted, totalPages) : 1;
  const pageIds = ids.slice((current - 1) * POSTS_PAGE_SIZE, current * POSTS_PAGE_SIZE);
  if (!pageIds.length) return { posts: [], page: current, totalPages, total: ids.length, truncated };

  // One Graph batch request for the page's posts (the ?ids= multi-lookup is
  // deprecated since v26). A post deleted meanwhile just drops out.
  const fields = edge.isInstagram ? IG_FIELDS : FB_FIELDS;
  const res = await axios.post(`https://graph.facebook.com/${apiVersion}/`, null, {
    params: {
      access_token: integration.access_token,
      batch: JSON.stringify(pageIds.map((id) => ({ method: "GET", relative_url: `${id}?fields=${fields}` }))),
    },
    timeout: 15000,
  });
  const posts = [];
  for (const item of Array.isArray(res.data) ? res.data : []) {
    if (item?.code !== 200) continue;
    try {
      const p = JSON.parse(item.body);
      if (p?.id) posts.push(normalize(p, edge.isInstagram));
    } catch { /* unreadable item — skipped */ }
  }
  return { posts, page: current, totalPages, total: ids.length, truncated };
}
