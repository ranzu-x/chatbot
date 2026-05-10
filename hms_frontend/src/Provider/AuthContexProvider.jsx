import React, { createContext, useContext, useEffect, useState } from 'react';
const AuthContext = createContext();

export const AuthContexProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true); // Wait for check auth

  const login = async (email, password) => {
    // const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/superadmin/login`, {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/superadmin/login`, {
    method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include', // cookie comes here
    });

    const data = await res.json();
    console.log(data);
    if (res.ok && data?.user) {
      console.log("user Data:", data);
      setUser(data.user);
      return true;
    }
    return false;
  };



  // Fetch Medicines
  // useEffect(() => {
  //   setLoading(true);
  //   fetch("http://localhost:5000/api/v1/medicines", { credentials: "include" })
  //     .then((res) => {
  //       console.log(res);
  //       if (!res.ok) {
  //         throw new Error(`HTTP error! status: ${res.status}`);
  //       }
  //       return res.json();
  //     })
  //     .then((data) => {
  //       setMedicines(data);
  //       setLoading(false);
  //     })
  //     .catch((err) => {
  //       console.error("Error fetching Medicines:", err);
  //       setLoading(false);
  //     });
  // }, []);




  const logout = async () => {
    await fetch(`${import.meta.env.VITE_API_URL}/api/v1/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  };



  // ✅ Restore login state on refresh
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/v1/check-auth`, {
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
        console.log("User data:", data);
        if (data?.user)
          setUser(data.user);
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