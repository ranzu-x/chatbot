import api from "./api";

const API_BASE = "/appointments";

/**
 * Fetch paginated appointments with all filter criteria
 */
export const fetchAppointments = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append("page", params.page.toString());
    if (params.limit) queryParams.append("limit", params.limit.toString());
    if (params.search) queryParams.append("search", params.search);
    if (params.status && params.status !== "all") queryParams.append("status", params.status);
    if (params.channel && params.channel !== "all") queryParams.append("channel", params.channel);
    if (params.staffId && params.staffId !== "all") queryParams.append("staffId", params.staffId);
    if (params.serviceId && params.serviceId !== "all") queryParams.append("serviceId", params.serviceId);
    if (params.date) queryParams.append("date", params.date);
    if (params.fromDate) queryParams.append("fromDate", params.fromDate);
    if (params.toDate) queryParams.append("toDate", params.toDate);

    const queryString = queryParams.toString();
    const endpoint = queryString ? `${API_BASE}?${queryString}` : API_BASE;
    const response = await api.get(endpoint);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching appointments:", error);
    throw error;
  }
};

/**
 * Fetch single appointment by ID
 */
export const fetchAppointmentById = async (id) => {
  try {
    const response = await api.get(`${API_BASE}/${id}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching appointment:", error);
    throw error;
  }
};

/**
 * Create a new appointment internally
 */
export const createAppointment = async (appointmentData) => {
  try {
    const response = await api.post(API_BASE, appointmentData);
    return response.data;
  } catch (error) {
    console.error("❌ Error creating appointment:", error);
    throw error;
  }
};

/**
 * Update an existing appointment (reschedule, notes, service, staff)
 */
export const updateAppointment = async (id, appointmentData) => {
  try {
    const response = await api.put(`${API_BASE}/${id}`, appointmentData);
    return response.data;
  } catch (error) {
    console.error("❌ Error updating appointment:", error);
    throw error;
  }
};

/**
 * Update appointment status (scheduled, confirmed, completed, cancelled, no_show)
 */
export const updateAppointmentStatus = async (id, newStatus, reason = null) => {
  try {
    const payload = { status: newStatus };
    if (reason) payload.cancellation_reason = reason;

    const response = await api.put(`${API_BASE}/${id}/status`, payload);
    return response.data;
  } catch (error) {
    console.error("❌ Error updating appointment status:", error);
    throw error;
  }
};

/**
 * Delete an appointment by ID
 */
export const deleteAppointment = async (id) => {
  try {
    const response = await api.delete(`${API_BASE}/${id}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error deleting appointment:", error);
    throw error;
  }
};

/**
 * Fetch appointment statistics for dashboard cards
 */
export const fetchAppointmentStats = async () => {
  try {
    const res = await api.get(`${API_BASE}/stats`);
    return res.data;
  } catch (error) {
    console.error("❌ Error fetching appointment stats:", error);
    throw error;
  }
};

// ─── SLOT SERVICES ────────────────────────────────────────────────────────────

export const fetchSlots = async (params = {}) => {
  try {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/slots?${query}` : "/slots";
    const res = await api.get(endpoint);
    return res.data;
  } catch (error) {
    console.error("❌ Error fetching slots:", error);
    throw error;
  }
};

export const createSlots = async (slotData) => {
  try {
    const res = await api.post("/slots", slotData);
    return res.data;
  } catch (error) {
    console.error("❌ Error creating slots:", error);
    throw error;
  }
};

export const updateSlot = async (id, slotData) => {
  try {
    const res = await api.put(`/slots/${id}`, slotData);
    return res.data;
  } catch (error) {
    console.error("❌ Error updating slot:", error);
    throw error;
  }
};

export const deleteSlot = async (id) => {
  try {
    const res = await api.delete(`/slots/${id}`);
    return res.data;
  } catch (error) {
    console.error("❌ Error deleting slot:", error);
    throw error;
  }
};

export const toggleSlot = async (id) => {
  try {
    const res = await api.put(`/slots/${id}/toggle`);
    return res.data;
  } catch (error) {
    console.error("❌ Error toggling slot:", error);
    throw error;
  }
};

export const bulkDeleteSlots = async (ids) => {
  try {
    const res = await api.post("/slots/bulk-delete", { ids });
    return res.data;
  } catch (error) {
    console.error("❌ Error bulk deleting slots:", error);
    throw error;
  }
};

export const bulkToggleSlots = async (ids, is_active) => {
  try {
    const res = await api.post("/slots/bulk-toggle", { ids, is_active });
    return res.data;
  } catch (error) {
    console.error("❌ Error bulk toggling slots:", error);
    throw error;
  }
};

export const purgePastSlots = async () => {
  try {
    const res = await api.delete("/slots/purge-past");
    return res.data;
  } catch (error) {
    console.error("❌ Error purging past slots:", error);
    throw error;
  }
};

export const fetchAvailableSlots = async (agencyId, date = null, staffId = null) => {
  try {
    const params = new URLSearchParams();
    if (agencyId) params.append("agencyId", agencyId.toString());
    if (date) params.append("date", date);
    if (staffId) params.append("staffId", staffId.toString());
    const res = await api.get(`/slots/availability?${params.toString()}`);
    return res.data;
  } catch (error) {
    console.error("❌ Error fetching available slots:", error);
    throw error;
  }
};

export const fetchAvailableDates = async (agencyId, fromDate = null, staffId = null, daysAhead = 30) => {
  try {
    const params = new URLSearchParams();
    if (agencyId) params.append("agencyId", agencyId.toString());
    if (fromDate) params.append("fromDate", fromDate);
    if (staffId) params.append("staffId", staffId.toString());
    if (daysAhead) params.append("daysAhead", daysAhead.toString());
    const res = await api.get(`/slots/availability/dates?${params.toString()}`);
    return res.data;
  } catch (error) {
    console.error("❌ Error fetching available dates:", error);
    throw error;
  }
};

// ─── SERVICES CATALOG ─────────────────────────────────────────────────────────

export const fetchAppointmentServices = async () => {
  try {
    const res = await api.get("/appointment-services");
    return res.data;
  } catch (error) {
    console.error("❌ Error fetching services:", error);
    throw error;
  }
};

export const createAppointmentService = async (serviceData) => {
  try {
    const res = await api.post("/appointment-services", serviceData);
    return res.data;
  } catch (error) {
    console.error("❌ Error creating service:", error);
    throw error;
  }
};

export const updateAppointmentService = async (id, serviceData) => {
  try {
    const res = await api.put(`/appointment-services/${id}`, serviceData);
    return res.data;
  } catch (error) {
    console.error("❌ Error updating service:", error);
    throw error;
  }
};

export const deleteAppointmentService = async (id) => {
  try {
    const res = await api.delete(`/appointment-services/${id}`);
    return res.data;
  } catch (error) {
    console.error("❌ Error deleting service:", error);
    throw error;
  }
};

export const fetchPublicServices = async (agencyId) => {
  try {
    const res = await api.get(`/appointment-services/public?agencyId=${agencyId}`);
    return res.data;
  } catch (error) {
    console.error("❌ Error fetching public services:", error);
    throw error;
  }
};

export const bookAppointmentPublic = async (bookingData) => {
  try {
    const res = await api.post("/appointments/book-public", bookingData);
    return res.data;
  } catch (error) {
    console.error("❌ Error booking public appointment:", error);
    throw error;
  }
};
