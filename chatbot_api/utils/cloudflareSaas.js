/**
 * Cloudflare for SaaS — custom hostnames on the platform's own zone.
 *
 * Every reseller domain (e.g. app.resellerbrand.com) becomes a "custom
 * hostname" of the platform zone. The reseller points a CNAME at
 * CUSTOM_DOMAIN_CNAME_TARGET. Cloudflare then validates ownership and issues
 * the SSL certificate (HTTP validation, automatic once the CNAME resolves),
 * and proxies the traffic to the zone's fallback origin (this app's server).
 *
 * Env: CLOUDFLARE_API_TOKEN (Zone → SSL and Certificates: Edit, Zone: Read)
 *      CLOUDFLARE_ZONE_ID   (the platform domain's zone)
 */
import axios from "axios";

const API = "https://api.cloudflare.com/client/v4";

export function isCloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID);
}

function client() {
  return axios.create({
    baseURL: `${API}/zones/${process.env.CLOUDFLARE_ZONE_ID}`,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    timeout: 20000,
  });
}

function cfError(err) {
  const errors = err.response?.data?.errors || [];
  const msg = errors.map((e) => e.message).join("; ") || err.message || "Cloudflare request failed";
  const out = new Error(`Cloudflare: ${msg}`);
  out.status = err.response?.status && err.response.status < 500 ? 400 : 502;
  out.cloudflareCodes = errors.map((e) => e.code);
  return out;
}

const SSL = { method: "http", type: "dv", settings: { min_tls_version: "1.2" } };

export async function createCustomHostname(hostname) {
  try {
    const { data } = await client().post("/custom_hostnames", { hostname, ssl: SSL });
    return data.result;
  } catch (err) {
    // Already on the zone (e.g. a retry after a crash) → reuse it.
    const e = cfError(err);
    if (e.cloudflareCodes.includes(1406)) {
      const existing = await findCustomHostname(hostname);
      if (existing) return existing;
    }
    throw e;
  }
}

export async function findCustomHostname(hostname) {
  try {
    const { data } = await client().get("/custom_hostnames", { params: { hostname } });
    return (data.result || [])[0] || null;
  } catch (err) {
    throw cfError(err);
  }
}

export async function getCustomHostname(id) {
  try {
    const { data } = await client().get(`/custom_hostnames/${id}`);
    return data.result;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw cfError(err);
  }
}

/** Re-runs validation (Cloudflare re-checks DNS / HTTP) — used by "Check now". */
export async function revalidateCustomHostname(id) {
  try {
    const { data } = await client().patch(`/custom_hostnames/${id}`, { ssl: SSL });
    return data.result;
  } catch (err) {
    throw cfError(err);
  }
}

export async function deleteCustomHostname(id) {
  try {
    await client().delete(`/custom_hostnames/${id}`);
  } catch (err) {
    if (err.response?.status === 404) return;
    throw cfError(err);
  }
}

/** The zone's fallback origin — must be set once (Super Admin setup check). */
export async function getFallbackOrigin() {
  try {
    const { data } = await client().get("/custom_hostnames/fallback_origin");
    return data.result || null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw cfError(err);
  }
}
