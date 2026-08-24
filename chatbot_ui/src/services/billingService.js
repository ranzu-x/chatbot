import api from "./api";

/**
 * Billing Service
 * Centralized API calls for billing management
 * Uses axios with global baseURL and withCredentials configuration from useFetch.js
 */

const API_BASE = "/api/v1/bills";

/**
 * Fetch paginated billing records with optional search
 * @param {number} page - Current page number (1-indexed)
 * @param {number} limit - Items per page
 * @param {string} searchTerm - Optional search query
 * @returns {Promise<{billing, pagination}>}
 */
export const fetchBilling = async (page = 1, limit = 10, searchTerm = "") => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(searchTerm && { search: searchTerm }),
    });

    const response = await api.get(`${API_BASE}?${params}`, {
      withCredentials: true,
    });

    console.log("✅ Billing records fetched:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching billing records:", error);
    throw error;
  }
};

/**
 * Fetch single billing record by ID
 * @param {string|number} id - Billing ID
 * @returns {Promise<billing>}
 */
export const fetchBillingById = async (id) => {
  try {
    const response = await api.get(`${API_BASE}/${id}`, {
      withCredentials: true,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching billing record:", error);
    throw error;
  }
};

/**
 * Create a new billing record
 * @param {object} billingData - Billing object
 * @returns {Promise<billing>}
 */
export const createBilling = async (billingData) => {
  try {
    const response = await api.post(API_BASE, billingData, {
      withCredentials: true,
    });

    console.log("✅ Billing record created:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error creating billing record:", error);
    throw error;
  }
};

/**
 * Update a billing record
 * @param {string|number} id - Billing ID
 * @param {object} billingData - Updated billing data
 * @returns {Promise<billing>}
 */
export const updateBilling = async (id, billingData) => {
  try {
    const response = await api.put(`${API_BASE}/${id}`, billingData, {
      withCredentials: true,
    });

    console.log("✅ Billing record updated:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error updating billing record:", error);
    throw error;
  }
};

/**
 * Delete a billing record by ID
 * @param {string|number} id - Billing ID
 * @returns {Promise<response>}
 */
export const deleteBilling = async (id) => {
  try {
    const response = await api.delete(`${API_BASE}/${id}`, {
      withCredentials: true,
    });

    console.log("✅ Billing record deleted:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error deleting billing record:", error);
    throw error;
  }
};

/**
 * Get billing summary/invoice
 * @param {string|number} appointmentId - Appointment ID for billing
 * @returns {Promise<invoice>}
 */
export const generateInvoice = async (appointmentId) => {
  try {
    const response = await api.get(`${API_BASE}/invoice/${appointmentId}`, {
      withCredentials: true,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error generating invoice:", error);
    throw error;
  }
};
