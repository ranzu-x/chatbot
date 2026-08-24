import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
const AuthContext = createContext();

export const AuthContexProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);

  const login = async (email, password) => {
    try {
      const res = await api.post("/api/v1/superadmin/login", { email, password });
      if (res.data?.user) {
        setUser(res.data.user);
        return true;
      }
    } catch (error) {
      console.error("Login error:", error);
    }
    return false;
  };

  const logout = async () => {
    try {
      await api.post("/api/v1/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
    }
  };

  // ✅ Restore login state on refresh
  useEffect(() => {
    api.get("/api/v1/check-auth")
      .then((res) => {
        if (res.data?.user) {
          setUser(res.data.user);
        }
      })
      .catch((err) => {
        console.error("Check-auth failed:", err);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);


  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading, medicines }}>
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = () => useContext(AuthContext);