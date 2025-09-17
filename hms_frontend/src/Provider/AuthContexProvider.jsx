import React, { createContext, useContext, useEffect, useState } from 'react';


const AuthContext = createContext();

export const AuthContexProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Wait for check auth

  const login = async (email, password) => {
    const res = await fetch("http://localhost:5000/api/v1/superadmin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include', // cookie comes here

    });

    const data = await res.json();
    if (res.ok && data?.user) {
      setUser(data.user);
      return true;
    }

    return false;
  };

  const logout = async () => {
    await fetch("http://localhost:5000/api/v1/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  };



  // ✅ Restore login state on refresh
  useEffect(() => {
    fetch("http://localhost:5000/api/v1/check-auth", {
      credentials: "include", // ✅ must include cookies
    })
      .then(async (res) => {
        console.log("check-auth status:", res.status);
        if (res.ok) return res.json();
        const text = await res.text();
        console.log("check-auth response:", text);
        return null;
      })
      .then((data) => {
        console.log("check-auth data:", data);
        if (data?.user) setUser(data.user);
      })
      .finally(() => setLoading(false));
  }, []);


  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = () => useContext(AuthContext);