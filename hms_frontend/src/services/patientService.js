import api from "./api";

const API_BASE = "/api/v1/patients";

/**
 * Fetch paginated patients with optional search
 */
export const fetchPatients = async (page = 1, limit = 10, searchTerm = "") => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (searchTerm) {
      params.append("search", searchTerm);
    }

    const response = await api.get(`${API_BASE}?${params.toString()}`);

    console.log("✅ Patients fetched:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching patients:", error);
    throw error;
  }
};

/**
 * Fetch single patient by ID
 */
export const fetchPatientById = async (id) => {
  try {
    const response = await api.get(`${API_BASE}/${id}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching patient:", error);
    throw error;
  }
};

/**
 * Create new patient
 */
export const createPatient = async (patientData) => {
  try {
    const response = await api.post(API_BASE, patientData);

    console.log("✅ Patient created:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error creating patient:", error);
    throw error;
  }
};

/**
 * Update patient
 */
export const updatePatient = async (id, patientData) => {
  try {
    const response = await api.put(`${API_BASE}/${id}`, patientData);

    console.log("✅ Patient updated:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error updating patient:", error);
    throw error;
  }
};

/**
 * Delete patient
 */
export const deletePatient = async (id) => {
  try {
    const response = await api.delete(`${API_BASE}/${id}`);

    console.log("✅ Patient deleted:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error deleting patient:", error);
    throw error;
  }
};

/**
 * Search patients
 */
export const searchPatients = async (query) => {
  try {
    const response = await api.get(
      `${API_BASE}/search?q=${encodeURIComponent(query)}`
    );

    return response.data;
  } catch (error) {
    console.error("❌ Error searching patients:", error);
    throw error;
  }
};