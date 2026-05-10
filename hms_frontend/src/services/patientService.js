import api from "./api";

/**
 * Patient Service
 * Centralized API calls for patient management
 * Uses axios with global baseURL and withCredentials configuration from useFetch.js
 */

const API_BASE = "/api/v1/patients";

/**
 * Fetch paginated patients with optional search
 * @param {number} page - Current page number (1-indexed)
 * @param {number} limit - Items per page
 * @param {string} searchTerm - Optional search query
 * @returns {Promise<{patients, pagination}>}
 */
export const fetchPatients = async (page = 1, limit = 10, searchTerm = "") => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(searchTerm && { search: searchTerm }),
    });

    const response = await api.get(`${API_BASE}?${params}`);

    console.log("✅ Patients fetched:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching patients:", error);
    throw error;
  }
};

/**
 * Fetch single patient by ID
 * @param {string|number} id - Patient ID
 * @returns {Promise<patient>}
 */
export const fetchPatientById = async (id) => {
  try {
    const response = await api.get(`${API_BASE}/${id}`, {
      withCredentials: true,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching patient:", error);
    throw error;
  }
};

/**
 * Create a new patient
 * @param {object} patientData - Patient object
 * @returns {Promise<patient>}
 */
export const createPatient = async (patientData) => {
  try {
    const response = await api.post(API_BASE, patientData, {
      withCredentials: true,
    });

    console.log("✅ Patient created:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error creating patient:", error);
    throw error;
  }
};

/**
 * Update a patient
 * @param {string|number} id - Patient ID
 * @param {object} patientData - Updated patient data
 * @returns {Promise<patient>}
 */
export const updatePatient = async (id, patientData) => {
  try {
    const response = await api.put(`${API_BASE}/${id}`, patientData, {
      withCredentials: true,
    });

    console.log("✅ Patient updated:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error updating patient:", error);
    throw error;
  }
};

/**
 * Delete a patient by ID
 * @param {string|number} id - Patient ID
 * @returns {Promise<response>}
 */
export const deletePatient = async (id) => {
  try {
    const response = await api.delete(`${API_BASE}/${id}`, {
      withCredentials: true,
    });

    console.log("✅ Patient deleted:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error deleting patient:", error);
    throw error;
  }
};

/**
 * Search patients
 * @param {string} query - Search query
 * @returns {Promise<patients>}
 */
export const searchPatients = async (query) => {
  try {
    const response = await api.get(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
      withCredentials: true,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error searching patients:", error);
    throw error;
  }
};
