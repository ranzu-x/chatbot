import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tenantAPI, assetUrl } from '../services/api';
import { useAuth } from './AuthContext';

/**
 * The brand the dashboard shows:
 *   1. a signed-in Reseller's own brand — for the Reseller, its team and its
 *      customers (`user.branding` from /auth/me) — on ANY address, the main
 *      domain included, so Reseller A and Reseller B each see their own logo;
 *   2. otherwise the brand of the address it's opened on (GET /auth/tenant):
 *      a reseller's white-label domain shows the reseller's brand, the main
 *      domain the Super Admin's (Custom Domain settings of the platform).
 * Sets the browser favicon + tab title and feeds the sidebar logo.
 */
const DEFAULT_BRAND = { brandName: 'Nexa Chatbot', logoUrl: '', logoIconUrl: '', faviconUrl: '', tagline: '', loaded: false };

const BrandingContext = createContext({ ...DEFAULT_BRAND, refreshBranding: () => {} });

function applyFavicon(url) {
  if (!url) return;
  const href = assetUrl(url);
  document.querySelectorAll("link[rel~='icon']").forEach((el) => el.parentNode.removeChild(el));
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  if (/\.png($|\?)/i.test(href)) link.type = 'image/png';
  else if (/\.ico($|\?)/i.test(href)) link.type = 'image/x-icon';
  document.head.appendChild(link);
}

const toBrand = (a) => ({
  brandName: a.brandName || a.name || DEFAULT_BRAND.brandName,
  tagline: a.tagline || '',
  logoUrl: a.logoUrl || '',
  logoIconUrl: a.logoIconUrl || '',
  faviconUrl: a.faviconUrl || '',
  isResellerBrand: Boolean(a.isResellerBrand),
  loaded: true,
});

export function BrandingProvider({ children }) {
  const { user, refreshUser } = useAuth();
  const [addressBrand, setAddressBrand] = useState(DEFAULT_BRAND);

  const refreshAddressBrand = useCallback(async () => {
    try {
      const res = await tenantAPI.resolveTenant();
      setAddressBrand(toBrand(res.data?.agency || {}));
    } catch {
      setAddressBrand((b) => ({ ...b, loaded: true }));
    }
  }, []);

  useEffect(() => { refreshAddressBrand(); }, [refreshAddressBrand]);

  const userBrand = user?.branding;
  const brand = useMemo(() => (userBrand ? toBrand(userBrand) : addressBrand), [userBrand, addressBrand]);

  useEffect(() => {
    if (!brand.loaded) return;
    applyFavicon(brand.faviconUrl);
    document.title = brand.brandName;
  }, [brand]);

  // After a branding change (Custom Domain page) both sources are re-read.
  const refreshBranding = useCallback(async () => {
    await Promise.all([refreshAddressBrand(), user ? refreshUser() : null]);
  }, [refreshAddressBrand, refreshUser, user]);

  return <BrandingContext.Provider value={{ ...brand, refreshBranding }}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);
