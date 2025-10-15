import { useState, useEffect, useCallback } from "react";
import axios from "axios";

// ✅ Configure Axios globally
axios.defaults.withCredentials = true;
axios.defaults.baseURL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export const useFetch = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 🧠 Memoized fetch function
  const fetchData = useCallback(async () => {
    if (!url) return; // skip if no URL passed

    try {
      setLoading(true);
      setError(null);

      const response = await axios({
        url,
        method: options.method || "GET",
        data: options.body || null,
        headers: options.headers || {},
        withCredentials: true, // send JWT cookie
      });

      setData(response.data);
    } catch (err) {
      console.error("useFetch error:", err);
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [url, options.method, options.body, options.headers]);

  // 🌀 Auto-fetch when url or options change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};


// Use Case Given below:
// const { data: doctors, loading: loadingDoctors } = useFetch("/api/v1/doctors");
// const { data: patients, loading: loadingPatients } = useFetch("/api/v1/patients");