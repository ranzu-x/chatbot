import { createContext, useContext, useState, useEffect } from "react";
import { supportAuthAPI, getSupportToken, setSupportToken, clearSupportToken } from "../../services/supportDeskApi";

const SupportAuthContext = createContext(null);

/**
 * A standalone auth context for the Support Desk portal — mirrors the
 * shape of Provider/AuthContext.jsx but reads/writes an independent
 * token (services/supportDeskApi.js's TOKEN_KEY) so this portal's
 * session is fully separate from the main dashboard's. Logs in against
 * the exact same /auth/login endpoint — same account, separate session.
 */
export function SupportAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getSupportToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    supportAuthAPI
      .me()
      .then((res) => setUser(res.data.user))
      .catch(() => {
        clearSupportToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("support_auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("support_auth:unauthorized", handleUnauthorized);
  }, []);

  const login = async (email, password) => {
    const res = await supportAuthAPI.login({ email, password });
    const { user, token } = res.data;
    if (token) setSupportToken(token);
    setUser(user);
    return user;
  };

  const logout = () => {
    clearSupportToken();
    setUser(null);
  };

  return (
    <SupportAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </SupportAuthContext.Provider>
  );
}

export const useSupportAuth = () => {
  const ctx = useContext(SupportAuthContext);
  if (!ctx) throw new Error("useSupportAuth must be used within SupportAuthProvider");
  return ctx;
};
