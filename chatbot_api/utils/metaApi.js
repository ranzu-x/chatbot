/**
 * The one Meta Graph API version the whole app calls (Facebook, Instagram,
 * WhatsApp). Change it here or with META_API_VERSION in .env — never
 * hard-code a version in a URL. Meta supports each version for about two
 * years; see developers.facebook.com/docs/graph-api/changelog.
 */
export const META_API_VERSION = process.env.META_API_VERSION || "v26.0";
export const GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;
