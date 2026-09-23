import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { forumAuthAPI, getForumToken, setForumToken, clearForumToken } from "../forumApi";

const ForumAuthContext = createContext(null);

/**
 * The forum portal's own auth context — independent of the dashboard's
 * Provider/AuthContext.jsx (separate token key, see ../forumApi.js). Being
 * signed out is a normal state here: the forum is publicly readable.
 */
export function ForumAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getForumToken()) {
      setUser(null);
      return null;
    }
    try {
      const res = await forumAuthAPI.me();
      setUser(res.data.user);
      return res.data.user;
    } catch {
      clearForumToken();
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("forum_auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("forum_auth:unauthorized", onUnauthorized);
  }, []);

  const login = async (email, password) => {
    const res = await forumAuthAPI.login({ email, password });
    const { user: loggedIn, token } = res.data;
    if (token) setForumToken(token);
    setUser(loggedIn);
    return loggedIn;
  };

  const logout = () => {
    clearForumToken();
    setUser(null);
  };

  return (
    <ForumAuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </ForumAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useForumAuth = () => {
  const ctx = useContext(ForumAuthContext);
  if (!ctx) throw new Error("useForumAuth must be used within ForumAuthProvider");
  return ctx;
};
