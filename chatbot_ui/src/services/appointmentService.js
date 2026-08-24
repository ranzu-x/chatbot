import api from "./api";

/**
 * Appointment Service
 * Centralized API calls for appointment management
 * Uses axios with global baseURL and withCredentials configuration from useFetch.js
 */

const API_BASE = "/api/v1/appointments";

/**
 * Fetch paginated appointments with optional search
 * @param {number} page - Current page number (1-indexed)
 * @param {number} limit - Items per page
 * @param {string} searchTerm - Optional search query
 * @returns {Promise<{appointments, pagination}>}
 */
export const fetchAppointments = async (page = 1, limit = 10, searchTerm = "") => {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(searchTerm && { search: searchTerm }),
    });

    const response = await api.get(`${API_BASE}?${params}`, {
      withCredentials: true,
    });

    console.log("✅ Appointments fetched:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching appointments:", error);
    throw error;
  }
};

/**
 * Update appointment status
 * @param {string|number} id - Appointment ID
 * @param {string} newStatus - New status (scheduled, confirmed, completed, cancelled)
 * @param {string} reason - Optional cancellation reason
 * @returns {Promise<response>}
 */
export const updateAppointmentStatus = async (id, newStatus, reason = null) => {
  try {
    const payload = { status: newStatus };
    if (reason) payload.cancellation_reason = reason;

    const response = await api.put(`${API_BASE}/${id}/status`, payload, {
      withCredentials: true,
    });

    console.log(`✅ Status updated to ${newStatus}:`, response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error updating appointment status:", error);
    throw error;
  }
};

/**
 * Delete an appointment by ID
 * @param {string|number} id - Appointment ID
 * @returns {Promise<response>}
 */
export const deleteAppointment = async (id) => {
  try {
    const response = await api.delete(`${API_BASE}/${id}`, {
      withCredentials: true,
    });

    console.log("✅ Appointment deleted:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error deleting appointment:", error);
    throw error;
  }
};

/**
 * Fetch single appointment by ID
 * @param {string|number} id - Appointment ID
 * @returns {Promise<appointment>}
 */
export const fetchAppointmentById = async (id) => {
  try {
    const response = await api.get(`${API_BASE}/${id}`, {
      withCredentials: true,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching appointment:", error);
    throw error;
  }
};

/**
 * Create a new appointment
 * @param {object} appointmentData - Appointment object
 * @returns {Promise<appointment>}
 */
export const createAppointment = async (appointmentData) => {
  try {
    const response = await api.post(API_BASE, appointmentData, {
      withCredentials: true,
    });

    console.log("✅ Appointment created:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error creating appointment:", error);
    throw error;
  }
};

/**
 * Update an appointment
 * @param {string|number} id - Appointment ID
 * @param {object} appointmentData - Updated appointment data
 * @returns {Promise<appointment>}
 */
export const updateAppointment = async (id, appointmentData) => {
  try {
    const response = await api.put(`${API_BASE}/${id}`, appointmentData, {
      withCredentials: true,
    });

    console.log("✅ Appointment updated:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error updating appointment:", error);
    throw error;
  }
};
