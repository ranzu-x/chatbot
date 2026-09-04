import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI, packageAPI } from "../services/api";

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

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { user, token } = res.data;
    if (token) localStorage.setItem("auth_token", token);
    setUser(user);
    fetchEntitlements();
    return user;
  };

  const logout = async () => {
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
      logout,
      setUser,
      entitlements,
      hasModule,
      refreshEntitlements: fetchEntitlements,
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
