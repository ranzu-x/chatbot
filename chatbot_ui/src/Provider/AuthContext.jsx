import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI, packageAPI } from "../services/api";
import { syncPushSubscription, forgetPushSubscription } from "../utils/browserPush";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [entitlements, setEntitlements] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchEntitlements = useCallback(async () => {
    try {
      const res = await packageAPI.getMyEntitlements();
      if (res.data?.entitlements) {
        setEntitlements(res.data.entitlements);
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      // If no token exists in localStorage, user is definitively logged out
      setUser(null);
      setEntitlements(null);
      setLoading(false);
      return;
    }

    // Validate stored token against the backend
    authAPI.me()
      .then((res) => {
        setUser(res.data.user);
        fetchEntitlements();
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
        setUser(null);
        setEntitlements(null);
      })
      .finally(() => setLoading(false));
  }, [fetchEntitlements]);

  // Re-reads the signed-in user (e.g. the plan status after a renewal).
  const refreshUser = useCallback(() => authAPI.me().then((res) => setUser(res.data.user)).catch(() => {}), []);

  // Listen for global 401 responses and cross-tab logout events
  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem("auth_token");
      setUser(null);
      setEntitlements(null);
      setLoading(false);
    };

    const handleStorageChange = (e) => {
      if (e.key === "auth_token" && !e.newValue) {
        setUser(null);
        setEntitlements(null);
        setLoading(false);
      }
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const startSession = (data) => {
    const { user, token } = data;
    if (token) localStorage.setItem("auth_token", token);
    setUser(user);
    fetchEntitlements();
    // The full profile (permissions, developer-apps access, the Reseller's brand) comes from /auth/me.
    authAPI.me().then((res) => setUser((current) => (current ? res.data.user : current))).catch(() => {});
    return user;
  };

  // With two-factor login on, the password step returns { twoFactorRequired, challengeToken }
  // instead of a session; the Login page then calls completeTwoFactor with the code.
  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    if (res.data?.twoFactorRequired) return { twoFactorRequired: true, challengeToken: res.data.challengeToken };
    return startSession(res.data);
  };

  const completeTwoFactor = async (challengeToken, { code, backupCode }) => {
    const res = await authAPI.loginTwoFactor({ challengeToken, code, backupCode });
    return startSession(res.data);
  };

  // "Sign out of all devices" — the server hands this browser a fresh token.
  const signOutEverywhere = async () => {
    const res = await authAPI.revokeAllSessions();
    return startSession(res.data);
  };

  // Changing the password signs out every other session; this browser gets a fresh token.
  const changePassword = async (data) => {
    const res = await authAPI.changePassword(data);
    return startSession(res.data);
  };

  // Browser notifications belong to whoever is signed in on this browser (utils/browserPush.js).
  useEffect(() => {
    if (user?.id) syncPushSubscription();
  }, [user?.id]);

  const logout = async () => {
    await forgetPushSubscription();
    try {
      await authAPI.logout();
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem("auth_token");
    setUser(null);
    setEntitlements(null);
  };

  // Helper: check if a specific module is enabled in user's active package
  const hasModule = useCallback((moduleKey) => {
    if (!user) return false;
    if (user.role === "ADMIN") return true; // Admins have full access
    if (!entitlements || !Array.isArray(entitlements.enabledModules)) return true; // Default fallback
    return entitlements.enabledModules.includes(moduleKey);
  }, [user, entitlements]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      completeTwoFactor,
      signOutEverywhere,
      changePassword,
      logout,
      setUser,
      entitlements,
      hasModule,
      refreshEntitlements: fetchEntitlements,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
