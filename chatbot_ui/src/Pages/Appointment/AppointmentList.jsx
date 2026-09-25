import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router";
import AppLayout from "../../Layout/AppLayout";
import { useAuth } from "../../Provider/AuthContext";
import toast from "react-hot-toast";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Settings,
  Copy,
  ExternalLink,
  MessageSquare,
  Phone,
  CalendarCheck,
  Check,
  Edit3,
  Eye,
  Share2,
  ChevronLeft,
  ChevronRight,
  Send,
  CalendarDays,
  LayoutList,
  Sparkles,
  UserCheck,
  Ban,
  X,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import {
  fetchAppointments,
  fetchAppointmentStats,
  updateAppointmentStatus,
  updateAppointment,
  deleteAppointment,
  createAppointment,
  fetchAvailableSlots,
  fetchAppointmentServices,
  fetchBookingLink,
} from "../../services/appointmentService";
import api from "../../services/api";
import { getSocketUrl, socketAuth } from "../../utils/socketAuth";
import { io } from "socket.io-client";
import { PlatformIcon } from "../../Components/Common/PlatformIcon";

// Status configuration with theme-compatible styling
const STATUS_CONFIG = {
  scheduled: {
    label: "Scheduled",
    color: "#2563eb",
    bg: "rgba(37, 99, 235, 0.08)",
    border: "rgba(37, 99, 235, 0.2)",
  },
  confirmed: {
    label: "Confirmed",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.08)",
    border: "rgba(16, 185, 129, 0.2)",
  },
  completed: {
    label: "Completed",
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.08)",
    border: "rgba(139, 92, 246, 0.2)",
  },
  cancelled: {
    label: "Cancelled",
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
  },
  no_show: {
    label: "No Show",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.08)",
    border: "rgba(245, 158, 11, 0.2)",
  },
};

const CANCELLATION_PRESETS = [
  "Client requested cancellation",
  "Client unreachable / no-show",
  "Staff unavailable / emergency",
  "Schedule conflict / double booked",
  "Service rescheduled to another date",
  "Other reason",
];

const selectBaseStyle = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: "0.82rem",
  cursor: "pointer",
  height: 36,
  outline: "none",
};

const inputBaseStyle = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  fontSize: "0.82rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function StatCard({ icon: Icon, title, value, sub, color }) {
  return (
    <div
      style={{
        flex: "1 1 170px",
        minWidth: 160,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: color ? `${color}15` : "var(--bg-hover)",
          color: color || "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={19} />
      </div>
      <div>
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.4px",
            marginBottom: 2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: "1.3rem",
            fontWeight: 800,
            lineHeight: 1.1,
            color: "var(--text-primary)",
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppointmentList() {
  const { user } = useAuth();
  const agencyId = user?.agencyId || user?.agency_id || user?.agency?.id || 1;

  // View switch: 'list' | 'agenda'
  const [viewMode, setViewMode] = useState("list");

  // Core Data
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    scheduled: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
    total_revenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Agenda View Selected Date
  const [agendaDate, setAgendaDate] = useState(new Date().toISOString().split("T")[0]);

  // Aux data
  const [teamMembers, setTeamMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Form State for Create & Edit
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    service_id: "",
    service_name: "General Consultation",
    appointment_date: new Date().toISOString().split("T")[0],
    appointment_time: "10:00",
    slot_id: "",
    staff_id: "",
    duration: 30,
    fee: 0,
    payment_status: "unpaid",
    channel: "MANUAL",
    status: "scheduled",
    notes: "",
  });

  // ── Fetch Appointments ────────────────────────────────────────────────────────
  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAppointments({
        page,
        limit: 15,
        search: search.trim() || undefined,
        status: statusFilter,
        channel: channelFilter,
        staffId: staffFilter,
        date: dateFilter || undefined,
      });

      setAppointments(res.appointments || []);
      if (res.pagination) {
        setTotalPages(res.pagination.totalPages || 1);
        setTotalItems(res.pagination.total || 0);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, channelFilter, staffFilter, dateFilter]);

  // ── Fetch Stats ──────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const res = await fetchAppointmentStats();
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err) {
      console.warn("Could not load stats:", err);
    }
  }, []);

  // ── Fetch Team Members ───────────────────────────────────────────────────────
  const loadTeamMembers = async () => {
    try {
      const res = await api.get("/team-members?limit=50");
      setTeamMembers(res.data?.members || res.data?.users || []);
    } catch (err) {
      console.warn("Could not load team members:", err);
    }
  };

  // ── Fetch Services ───────────────────────────────────────────────────────────
  const loadServices = async () => {
    try {
      const res = await fetchAppointmentServices();
      setServices(res.services || []);
    } catch (err) {
      console.warn("Could not load services:", err);
    }
  };

  // ── Initial Boot ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAppointments();
    loadStats();
    loadTeamMembers();
    loadServices();
  }, [loadAppointments, loadStats]);

  // ── Live Socket Connection ───────────────────────────────────────────────────
  useEffect(() => {
    let socket;
    try {
      const socketUrl = getSocketUrl();
      socket = io(socketUrl, {
        auth: socketAuth(),
        transports: ["websocket", "polling"],
      });

      socket.on("connect", () => {
        setIsLiveConnected(true);
      });

      socket.on("disconnect", () => {
        setIsLiveConnected(false);
      });

      socket.on("new_appointment", (data) => {
        toast((tObj) => (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CalendarCheck style={{ color: "var(--success)" }} size={20} />
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>
                New Booking Received!
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                {data.customerName} booked {data.service} on {data.date} at {data.time}
              </div>
            </div>
          </div>
        ));
        loadAppointments();
        loadStats();
      });

      socket.on("appointment_updated", () => {
        loadAppointments();
        loadStats();
      });

      socket.on("appointment_deleted", () => {
        loadAppointments();
        loadStats();
      });
    } catch (e) {
      console.warn("Socket initialization skipped:", e);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [loadAppointments, loadStats]);

  // ── Load Available Slots when Modal Date or Staff Changes ─────────────────────
  const handleDateOrStaffChangeInModal = async (date, staffId = null) => {
    setFormData((prev) => ({ ...prev, appointment_date: date, slot_id: "" }));
    if (!agencyId || !date) {
      setAvailableSlots([]);
      return;
    }
    setSlotsLoading(true);
    try {
      const res = await fetchAvailableSlots(agencyId, date, staffId || null);
      setAvailableSlots(res.slots || []);
    } catch (e) {
      console.warn("Slot fetch failed:", e);
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  // ── Quick Status Change ──────────────────────────────────────────────────────
  const handleStatusChange = async (id, newStatus, reason = null) => {
    try {
      await updateAppointmentStatus(id, newStatus, reason);
      toast.success(`Appointment marked as ${newStatus}`);
      loadAppointments();
      loadStats();
      if (selectedAppointment && selectedAppointment.id === id) {
        setSelectedAppointment((prev) => ({
          ...prev,
          status: newStatus,
          cancellation_reason: reason || prev?.cancellation_reason,
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  // ── Prompt Cancel Modal ──────────────────────────────────────────────────────
  const openCancelModal = (apt) => {
    setSelectedAppointment(apt);
    setCancellationReason("");
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedAppointment) return;
    setModalLoading(true);
    try {
      await updateAppointmentStatus(
        selectedAppointment.id,
        "cancelled",
        cancellationReason.trim() || "Cancelled by workspace staff"
      );
      toast.success("Appointment cancelled successfully");
      setIsCancelModalOpen(false);
      loadAppointments();
      loadStats();
      if (isDetailModalOpen) {
        setSelectedAppointment((prev) => ({
          ...prev,
          status: "cancelled",
          cancellation_reason: cancellationReason.trim() || "Cancelled by workspace staff",
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel appointment");
    } finally {
      setModalLoading(false);
    }
  };

  // ── Delete Appointment ───────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this appointment record?")) {
      return;
    }
    try {
      await deleteAppointment(id);
      toast.success("Appointment deleted");
      loadAppointments();
      loadStats();
      if (isDetailModalOpen && selectedAppointment?.id === id) {
        setIsDetailModalOpen(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete appointment");
    }
  };

  // ── Open Edit / Reschedule Modal ─────────────────────────────────────────────
  const openEditModal = (apt) => {
    setSelectedAppointment(apt);
    const dateStr = apt.appointment_date
      ? apt.appointment_date.substring(0, 10)
      : new Date().toISOString().split("T")[0];
    const timeStr = apt.appointment_time ? apt.appointment_time.substring(0, 5) : "10:00";

    setFormData({
      customer_name: apt.customer_name || "",
      customer_phone: apt.customer_phone || "",
      customer_email: apt.customer_email || "",
      service_id: apt.service_id || "",
      service_name: apt.service_name || "General Consultation",
      appointment_date: dateStr,
      appointment_time: timeStr,
      slot_id: apt.slot_id || "",
      staff_id: apt.staff_id || "",
      duration: apt.duration || 30,
      fee: apt.fee || 0,
      payment_status: apt.payment_status || "unpaid",
      channel: apt.channel || "MANUAL",
      status: apt.status || "scheduled",
      notes: apt.notes || "",
    });

    handleDateOrStaffChangeInModal(dateStr, apt.staff_id);
    setIsEditModalOpen(true);
  };

  // ── Open Detail Modal ────────────────────────────────────────────────────────
  const openDetailModal = (apt) => {
    setSelectedAppointment(apt);
    setIsDetailModalOpen(true);
  };

  // ── Submit Create Appointment ────────────────────────────────────────────────
  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    if (!formData.customer_name.trim() || !formData.appointment_date || !formData.appointment_time) {
      toast.error("Please provide client name, date, and time");
      return;
    }

    setModalLoading(true);
    try {
      await createAppointment(formData);
      toast.success("Appointment booked successfully!");
      setIsNewModalOpen(false);
      setFormData({
        customer_name: "",
        customer_phone: "",
        customer_email: "",
        service_id: "",
        service_name: "General Consultation",
        appointment_date: new Date().toISOString().split("T")[0],
        appointment_time: "10:00",
        slot_id: "",
        staff_id: "",
        duration: 30,
        fee: 0,
        payment_status: "unpaid",
        channel: "MANUAL",
        status: "scheduled",
        notes: "",
      });
      loadAppointments();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to schedule appointment");
    } finally {
      setModalLoading(false);
    }
  };

  // ── Submit Update Appointment ────────────────────────────────────────────────
  const handleUpdateAppointment = async (e) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    setModalLoading(true);
    try {
      await updateAppointment(selectedAppointment.id, formData);
      toast.success("Appointment updated successfully");
      setIsEditModalOpen(false);
      loadAppointments();
      loadStats();
      if (isDetailModalOpen) {
        setSelectedAppointment((prev) => ({
          ...prev,
          ...formData,
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update appointment");
    } finally {
      setModalLoading(false);
    }
  };

  // Auto-populate service price and duration
  const handleServiceSelect = (svcId) => {
    const selected = services.find((s) => s.id === parseInt(svcId));
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        service_id: selected.id,
        service_name: selected.name,
        duration: selected.duration_minutes || 30,
        fee: parseFloat(selected.price) || 0,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        service_id: "",
        service_name: "General Consultation",
        duration: 30,
        fee: 0,
      }));
    }
  };

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (statusFilter !== "all") count++;
    if (channelFilter !== "all") count++;
    if (staffFilter !== "all") count++;
    if (dateFilter) count++;
    return count;
  }, [search, statusFilter, channelFilter, staffFilter, dateFilter]);

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setChannelFilter("all");
    setStaffFilter("all");
    setDateFilter("");
    setPage(1);
  };

  const formatDateString = (dateVal) => {
    if (!dateVal) return "-";
    const str = typeof dateVal === "string" ? dateVal.substring(0, 10) : "";
    try {
      const [year, month, day] = str.split("-");
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return str;
    }
  };

  const isDateToday = (dateVal) => {
    if (!dateVal) return false;
    const str = typeof dateVal === "string" ? dateVal.substring(0, 10) : "";
    const today = new Date().toISOString().split("T")[0];
    return str === today;
  };

  const agendaAppointments = useMemo(() => {
    return appointments
      .filter((a) => {
        const d = a.appointment_date?.substring(0, 10);
        return d === agendaDate;
      })
      .sort((a, b) => (a.appointment_time || "").localeCompare(b.appointment_time || ""));
  }, [appointments, agendaDate]);

  // The portal link carries the workspace's booking key (utils/publicBooking.js);
  // without it the public booking API refuses the request.
  const [bookingKey, setBookingKey] = useState("");
  useEffect(() => {
    fetchBookingLink().then((d) => setBookingKey(d?.key || "")).catch(() => setBookingKey(""));
  }, []);
  const bookingPortalUrl = bookingKey ? `${window.location.origin}/book/${agencyId}?k=${bookingKey}` : "";

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px" }}>
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: "var(--bg-hover)",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <Calendar size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 800,
                    margin: 0,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.3px",
                  }}
                >
                  Appointments & Schedule
                </h1>
                {isLiveConnected && (
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(16, 185, 129, 0.1)",
                      color: "var(--success)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--success)",
                      }}
                    />
                    Live Sync
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 2 }}>
                Manage client bookings seamlessly across WhatsApp, Messenger, Instagram, Telegram, and Webchat.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* View Switcher */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--bg-hover)",
                padding: 3,
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode("list")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  fontWeight: viewMode === "list" ? 700 : 500,
                  background: viewMode === "list" ? "var(--bg-surface)" : "transparent",
                  color: viewMode === "list" ? "var(--text-primary)" : "var(--text-secondary)",
                  border: "none",
                  boxShadow: viewMode === "list" ? "var(--shadow-sm)" : "none",
                  cursor: "pointer",
                }}
              >
                <LayoutList size={14} /> List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("agenda")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  fontWeight: viewMode === "agenda" ? 700 : 500,
                  background: viewMode === "agenda" ? "var(--bg-surface)" : "transparent",
                  color: viewMode === "agenda" ? "var(--text-primary)" : "var(--text-secondary)",
                  border: "none",
                  boxShadow: viewMode === "agenda" ? "var(--shadow-sm)" : "none",
                  cursor: "pointer",
                }}
              >
                <CalendarDays size={14} /> Agenda
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: "0.82rem",
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              <Share2 size={14} /> Booking Link
            </button>

            <Link
              to="/appointments/slots"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: "0.82rem",
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                textDecoration: "none",
              }}
            >
              <Settings size={14} /> Slot Manager
            </Link>

            <Link
              to="/appointments/slots?tab=campaigns"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: "0.82rem",
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                textDecoration: "none",
              }}
            >
              <Workflow size={14} /> Campaigns
            </Link>

            <button
              type="button"
              onClick={() => {
                setFormData({
                  customer_name: "",
                  customer_phone: "",
                  customer_email: "",
                  service_id: "",
                  service_name: "General Consultation",
                  appointment_date: new Date().toISOString().split("T")[0],
                  appointment_time: "10:00",
                  slot_id: "",
                  staff_id: "",
                  duration: 30,
                  fee: 0,
                  payment_status: "unpaid",
                  channel: "MANUAL",
                  status: "scheduled",
                  notes: "",
                });
                handleDateOrStaffChangeInModal(new Date().toISOString().split("T")[0]);
                setIsNewModalOpen(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                fontSize: "0.82rem",
                fontWeight: 700,
                borderRadius: 8,
                border: "none",
                background: "var(--primary)",
                color: "#ffffff",
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <Plus size={15} /> Book Appointment
            </button>

            <button
              type="button"
              onClick={() => {
                loadAppointments();
                loadStats();
              }}
              title="Refresh"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── KPI Metric Cards ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <StatCard
            icon={Calendar}
            title="Total Bookings"
            value={stats.total || 0}
            sub={`${stats.today || 0} today`}
          />
          <StatCard
            icon={Clock}
            title="Today's Schedule"
            value={stats.today || 0}
            color="var(--primary)"
          />
          <StatCard
            icon={CalendarCheck}
            title="Scheduled"
            value={stats.scheduled || 0}
            color="#2563eb"
          />
          <StatCard
            icon={CheckCircle2}
            title="Confirmed"
            value={stats.confirmed || 0}
            color="var(--success)"
          />
          <StatCard
            icon={UserCheck}
            title="Completed"
            value={stats.completed || 0}
            color="#8b5cf6"
          />
          <StatCard
            icon={XCircle}
            title="Cancelled"
            value={(parseInt(stats.cancelled) || 0) + (parseInt(stats.no_show) || 0)}
            color="var(--danger)"
          />
        </div>

        {/* ── Filters & Search Toolbar ──────────────────────────────────────── */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {/* Search Box */}
          <div style={{ position: "relative", minWidth: 260, flex: "1 1 280px", maxWidth: 420 }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search by client, phone, email, or service..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                ...inputBaseStyle,
                paddingLeft: 36,
                paddingRight: 32,
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 2,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={selectBaseStyle}
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>

            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              style={selectBaseStyle}
            >
              <option value="all">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="FACEBOOK">Facebook Messenger</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="TELEGRAM">Telegram</option>
              <option value="WEBCHAT">Webchat</option>
              <option value="MANUAL">Manual / Phone</option>
            </select>

            <select
              value={staffFilter}
              onChange={(e) => {
                setStaffFilter(e.target.value);
                setPage(1);
              }}
              style={selectBaseStyle}
            >
              <option value="all">All Staff</option>
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name || tm.email}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              style={selectBaseStyle}
            />

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  background: "rgba(239, 68, 68, 0.08)",
                  color: "var(--danger)",
                  cursor: "pointer",
                }}
              >
                <X size={13} /> Reset ({activeFiltersCount})
              </button>
            )}
          </div>
        </div>

        {/* ── View Switch: List View vs Agenda View ──────────────────────────── */}
        {viewMode === "list" ? (
          /* ════════════════════════════════════════════════════════════════════
             LIST / TABLE VIEW
             ════════════════════════════════════════════════════════════════════ */
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.84rem",
                }}
              >
                <thead>
                  <tr style={{ background: "var(--bg-input)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "12px 18px", fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Client</th>
                    <th style={{ padding: "12px 18px", fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Service</th>
                    <th style={{ padding: "12px 18px", fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date & Time</th>
                    <th style={{ padding: "12px 18px", fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Channel</th>
                    <th style={{ padding: "12px 18px", fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Staff</th>
                    <th style={{ padding: "12px 18px", fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 18px", fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "50px 0", textAlign: "center" }}>
                        <div className="loading-spinner" style={{ margin: "0 auto 12px" }} />
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.88rem" }}>
                          Loading appointments...
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
                          Retrieving booked schedules
                        </div>
                      </td>
                    </tr>
                  ) : appointments.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "60px 0", textAlign: "center" }}>
                        <div
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 14,
                            background: "var(--bg-hover)",
                            color: "var(--text-muted)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 14px",
                          }}
                        >
                          <CalendarCheck size={28} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: "0.98rem", color: "var(--text-primary)" }}>
                          No appointments found
                        </div>
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "var(--text-secondary)",
                            maxWidth: 380,
                            margin: "6px auto 18px",
                            lineHeight: 1.5,
                          }}
                        >
                          {activeFiltersCount > 0
                            ? "No bookings match your selected filter criteria. Try clearing filters."
                            : "No bookings have been scheduled yet. You can create a new booking or share your booking link with customers."}
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                          {activeFiltersCount > 0 ? (
                            <button
                              type="button"
                              onClick={clearAllFilters}
                              style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "1px solid var(--border)",
                                background: "var(--bg-surface)",
                                color: "var(--text-primary)",
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Clear Filters
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setIsNewModalOpen(true)}
                                style={{
                                  padding: "8px 16px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: "var(--primary)",
                                  color: "#ffffff",
                                  fontSize: "0.82rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                + Book Appointment
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsShareModalOpen(true)}
                                style={{
                                  padding: "8px 16px",
                                  borderRadius: 8,
                                  border: "1px solid var(--border)",
                                  background: "var(--bg-surface)",
                                  color: "var(--text-primary)",
                                  fontSize: "0.82rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Share Booking Link
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    appointments.map((apt) => {
                      const statusConf = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;
                      const isToday = isDateToday(apt.appointment_date);

                      return (
                        <tr
                          key={apt.id}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                            transition: "background 0.12s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => openDetailModal(apt)}
                        >
                          {/* Client */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: "50%",
                                  background: "var(--bg-hover)",
                                  color: "var(--text-secondary)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: "0.82rem",
                                  border: "1px solid var(--border)",
                                  flexShrink: 0,
                                }}
                              >
                                {apt.customer_name ? apt.customer_name.charAt(0).toUpperCase() : "C"}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                  {apt.customer_name || "Anonymous Client"}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                                  <span>{apt.customer_phone || apt.customer_email || "No contact"}</span>
                                  {apt.customer_phone && (
                                    <a
                                      href={`https://wa.me/${apt.customer_phone.replace(/[^0-9]/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ color: "var(--success)", display: "inline-flex" }}
                                      title="Chat on WhatsApp"
                                    >
                                      <MessageSquare size={12} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Service */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {apt.service_color && (
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    backgroundColor: apt.service_color,
                                    display: "inline-block",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                {apt.service_name || apt.service_catalog_name || "General Consultation"}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                              {apt.duration || 30} mins
                              {parseFloat(apt.fee) > 0 && ` • $${parseFloat(apt.fee).toFixed(2)}`}
                            </div>
                          </td>

                          {/* Date & Time */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                {formatDateString(apt.appointment_date)}
                              </span>
                              {isToday && (
                                <span
                                  style={{
                                    fontSize: "0.64rem",
                                    fontWeight: 800,
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                    background: "rgba(16, 185, 129, 0.12)",
                                    color: "var(--success)",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Today
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                              <Clock size={11} />
                              <span>{apt.appointment_time?.substring(0, 5) || "10:00"}</span>
                            </div>
                          </td>

                          {/* Channel */}
                          <td style={{ padding: "14px 18px" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 8px",
                                borderRadius: 6,
                                background: "var(--bg-hover)",
                                border: "1px solid var(--border)",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "var(--text-secondary)",
                              }}
                            >
                              <PlatformIcon platform={apt.channel || "MANUAL"} size={14} />
                              <span>{apt.channel || "Manual"}</span>
                            </div>
                          </td>

                          {/* Staff */}
                          <td style={{ padding: "14px 18px" }}>
                            {apt.staff_name ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    background: "var(--bg-hover)",
                                    color: "var(--text-secondary)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {apt.staff_name.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                                  {apt.staff_name}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontStyle: "italic" }}>
                                Unassigned
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: "14px 18px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                color: statusConf.color,
                                background: statusConf.bg,
                                border: `1px solid ${statusConf.border}`,
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: statusConf.color,
                                }}
                              />
                              {statusConf.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td
                            style={{ padding: "14px 18px", textAlign: "right" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                              {apt.status === "scheduled" && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(apt.id, "confirmed")}
                                  title="Confirm Appointment"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border: "1px solid rgba(16, 185, 129, 0.3)",
                                    background: "rgba(16, 185, 129, 0.08)",
                                    color: "var(--success)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Check size={14} />
                                </button>
                              )}

                              {apt.status === "confirmed" && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(apt.id, "completed")}
                                  title="Mark as Completed"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border: "1px solid rgba(139, 92, 246, 0.3)",
                                    background: "rgba(139, 92, 246, 0.08)",
                                    color: "#8b5cf6",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openEditModal(apt)}
                                title="Edit / Reschedule"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: "1px solid var(--border)",
                                  background: "var(--bg-surface)",
                                  color: "var(--text-secondary)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                }}
                              >
                                <Edit3 size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={() => openDetailModal(apt)}
                                title="View Details"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: "1px solid var(--border)",
                                  background: "var(--bg-surface)",
                                  color: "var(--text-secondary)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                }}
                              >
                                <Eye size={13} />
                              </button>

                              {apt.status !== "cancelled" && apt.status !== "completed" && (
                                <button
                                  type="button"
                                  onClick={() => openCancelModal(apt)}
                                  title="Cancel Appointment"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border: "1px solid rgba(239, 68, 68, 0.25)",
                                    background: "rgba(239, 68, 68, 0.06)",
                                    color: "var(--danger)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  <XCircle size={14} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDelete(apt.id)}
                                title="Delete Record"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: "1px solid var(--border)",
                                  background: "var(--bg-surface)",
                                  color: "var(--text-muted)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Strip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--bg-input)",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Showing{" "}
                <strong style={{ color: "var(--text-primary)" }}>{appointments.length}</strong> of{" "}
                <strong style={{ color: "var(--text-primary)" }}>{totalItems}</strong> bookings
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: page <= 1 ? "var(--text-muted)" : "var(--text-primary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <ChevronLeft size={13} /> Previous
                </button>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)", padding: "0 6px" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: page >= totalPages ? "var(--text-muted)" : "var(--text-primary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════════════
             AGENDA / CALENDAR VIEW
             ════════════════════════════════════════════════════════════════════ */
          <div>
            {/* Agenda Day Selector Bar */}
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(agendaDate);
                    d.setDate(d.getDate() - 1);
                    setAgendaDate(d.toISOString().split("T")[0]);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                  title="Previous Day"
                >
                  <ChevronLeft size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => setAgendaDate(new Date().toISOString().split("T")[0])}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(agendaDate);
                    d.setDate(d.getDate() + 1);
                    setAgendaDate(d.toISOString().split("T")[0]);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                  title="Next Day"
                >
                  <ChevronRight size={16} />
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    {formatDateString(agendaDate)}
                  </span>
                  {isDateToday(agendaDate) && (
                    <span
                      style={{
                        fontSize: "0.64rem",
                        fontWeight: 800,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "rgba(16, 185, 129, 0.12)",
                        color: "var(--success)",
                        textTransform: "uppercase",
                      }}
                    >
                      Today
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Jump to Date:</span>
                <input
                  type="date"
                  value={agendaDate}
                  onChange={(e) => setAgendaDate(e.target.value)}
                  style={selectBaseStyle}
                />
              </div>
            </div>

            {/* Agenda Timeline Card List */}
            {agendaAppointments.length === 0 ? (
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "50px 20px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "var(--bg-hover)",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                  }}
                >
                  <CalendarDays size={24} />
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                  No appointments scheduled for this date
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
                  No clients booked on {formatDateString(agendaDate)}.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      appointment_date: agendaDate,
                    }));
                    handleDateOrStaffChangeInModal(agendaDate);
                    setIsNewModalOpen(true);
                  }}
                  style={{
                    marginTop: 16,
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--primary)",
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  + Schedule Booking for {formatDateString(agendaDate)}
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
                  gap: 14,
                }}
              >
                {agendaAppointments.map((apt) => {
                  const statusConf = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;

                  return (
                    <div
                      key={apt.id}
                      onClick={() => openDetailModal(apt)}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 16,
                        cursor: "pointer",
                        boxShadow: "var(--shadow-sm)",
                        transition: "all 0.15s ease",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--border-light)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: "var(--bg-hover)",
                              color: "var(--text-secondary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.82rem",
                              border: "1px solid var(--border)",
                              flexShrink: 0,
                            }}
                          >
                            {apt.customer_name ? apt.customer_name.charAt(0).toUpperCase() : "C"}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                              {apt.customer_name}
                            </div>
                            <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                              {apt.customer_phone || "No phone"}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 999,
                            color: statusConf.color,
                            background: statusConf.bg,
                            border: `1px solid ${statusConf.border}`,
                          }}
                        >
                          {statusConf.label}
                        </span>
                      </div>

                      <div
                        style={{
                          background: "var(--bg-input)",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          <span>{apt.service_name}</span>
                          <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>
                            {apt.appointment_time?.substring(0, 5)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 4 }}>
                          <span>{apt.duration} mins</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <PlatformIcon platform={apt.channel || "MANUAL"} size={12} />
                            {apt.channel || "Manual"}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: "0.76rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>
                          Staff: <strong style={{ color: "var(--text-secondary)" }}>{apt.staff_name || "Unassigned"}</strong>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openEditModal(apt)}
                            title="Reschedule"
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              border: "1px solid var(--border)",
                              background: "var(--bg-surface)",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDetailModal(apt)}
                            title="View"
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              border: "1px solid var(--border)",
                              background: "var(--bg-surface)",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 1: VIEW DETAILS
            ════════════════════════════════════════════════════════════════════ */}
        {isDetailModalOpen && selectedAppointment && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 14,
                width: "100%",
                maxWidth: 520,
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow)",
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
                <div>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Booking #APT-{selectedAppointment.id}
                  </div>
                  <h3 style={{ margin: "2px 0 0 0", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Appointment Overview
                  </h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 999,
                      color: (STATUS_CONFIG[selectedAppointment.status] || STATUS_CONFIG.scheduled).color,
                      background: (STATUS_CONFIG[selectedAppointment.status] || STATUS_CONFIG.scheduled).bg,
                      border: `1px solid ${(STATUS_CONFIG[selectedAppointment.status] || STATUS_CONFIG.scheduled).border}`,
                    }}
                  >
                    {(STATUS_CONFIG[selectedAppointment.status] || STATUS_CONFIG.scheduled).label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsDetailModalOpen(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 4,
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Client Profile Box */}
              <div
                style={{
                  background: "var(--bg-input)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Client Profile
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <PlatformIcon platform={selectedAppointment.channel || "MANUAL"} size={13} />
                    {selectedAppointment.channel || "Manual"}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "var(--bg-hover)",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.95rem",
                      fontWeight: 800,
                      border: "1px solid var(--border)",
                      flexShrink: 0,
                    }}
                  >
                    {selectedAppointment.customer_name ? selectedAppointment.customer_name.charAt(0).toUpperCase() : "C"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                      {selectedAppointment.customer_name || "Anonymous Client"}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>
                      {selectedAppointment.customer_phone || "No phone provided"}
                    </div>
                    {selectedAppointment.customer_email && (
                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        {selectedAppointment.customer_email}
                      </div>
                    )}
                  </div>
                </div>

                {selectedAppointment.customer_phone && (
                  <div style={{ display: "flex", gap: 8, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                    <a
                      href={`https://wa.me/${selectedAppointment.customer_phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                        `Hi ${selectedAppointment.customer_name}, confirming your appointment for ${selectedAppointment.service_name} on ${selectedAppointment.appointment_date?.substring(0, 10)} at ${selectedAppointment.appointment_time?.substring(0, 5)}.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 6,
                        background: "var(--channel-whatsapp)",
                        color: "#ffffff",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      <Send size={12} /> WhatsApp Message
                    </a>
                    <a
                      href={`tel:${selectedAppointment.customer_phone}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 6,
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      <Phone size={12} /> Call
                    </a>
                  </div>
                )}
              </div>

              {/* Grid Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "0.8rem" }}>
                <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                    Service
                  </span>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{selectedAppointment.service_name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {selectedAppointment.duration} mins • ${parseFloat(selectedAppointment.fee || 0).toFixed(2)}
                  </div>
                </div>

                <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                    Date & Time
                  </span>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                    {formatDateString(selectedAppointment.appointment_date)}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {selectedAppointment.appointment_time?.substring(0, 5)}
                  </div>
                </div>

                <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                    Assigned Staff
                  </span>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                    {selectedAppointment.staff_name || "Unassigned"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {selectedAppointment.staff_email || "No email"}
                  </div>
                </div>

                <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                    Payment Status
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: selectedAppointment.payment_status === "paid" ? "var(--success)" : "var(--text-secondary)",
                      background: selectedAppointment.payment_status === "paid" ? "rgba(16, 185, 129, 0.12)" : "var(--bg-hover)",
                    }}
                  >
                    {selectedAppointment.payment_status || "unpaid"}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {selectedAppointment.notes && (
                <div style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: "0.8rem" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                    Notes
                  </span>
                  <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                    {selectedAppointment.notes}
                  </div>
                </div>
              )}

              {/* Cancellation Reason */}
              {selectedAppointment.status === "cancelled" && selectedAppointment.cancellation_reason && (
                <div style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.25)", background: "rgba(239, 68, 68, 0.06)", fontSize: "0.8rem", color: "var(--danger)" }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                    Cancellation Reason
                  </span>
                  <div>{selectedAppointment.cancellation_reason}</div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedAppointment.status === "scheduled" && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(selectedAppointment.id, "confirmed")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "var(--success)",
                        color: "#ffffff",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Confirm
                    </button>
                  )}

                  {selectedAppointment.status !== "completed" && selectedAppointment.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(selectedAppointment.id, "completed")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "#8b5cf6",
                        color: "#ffffff",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Complete
                    </button>
                  )}

                  {selectedAppointment.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDetailModalOpen(false);
                        openCancelModal(selectedAppointment);
                      }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        background: "rgba(239, 68, 68, 0.08)",
                        color: "var(--danger)",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      openEditModal(selectedAppointment);
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Reschedule
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 2: NEW / EDIT APPOINTMENT
            ════════════════════════════════════════════════════════════════════ */}
        {(isNewModalOpen || isEditModalOpen) && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 14,
                width: "100%",
                maxWidth: 520,
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow)",
                padding: 22,
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "var(--bg-hover)",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CalendarCheck size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      {isEditModalOpen ? "Reschedule / Edit Appointment" : "Create New Appointment"}
                    </h3>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {isEditModalOpen ? "Modify booking schedule or details" : "Schedule an appointment on behalf of a client"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewModalOpen(false);
                    setIsEditModalOpen(false);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={isEditModalOpen ? handleUpdateAppointment : handleCreateAppointment}
                style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16, fontSize: "0.82rem" }}
              >
                {/* Client Name & Phone */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Client Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sarah Jenkins"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Phone / WhatsApp *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="+1 555 123 4567"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="sarah@example.com"
                    value={formData.customer_email}
                    onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    style={inputBaseStyle}
                  />
                </div>

                {/* Service Selection */}
                <div>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                    Service Booked
                  </label>
                  <select
                    value={formData.service_id}
                    onChange={(e) => handleServiceSelect(e.target.value)}
                    style={{ ...selectBaseStyle, width: "100%" }}
                  >
                    <option value="">Custom / General Consultation</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} ({svc.duration_minutes}m • ${parseFloat(svc.price).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date & Time / Slot Selection */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.appointment_date}
                      onChange={(e) => handleDateOrStaffChangeInModal(e.target.value, formData.staff_id)}
                      style={inputBaseStyle}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Time Slot {slotsLoading && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(Checking...)</span>}
                    </label>
                    {availableSlots.length > 0 ? (
                      <select
                        value={formData.slot_id}
                        onChange={(e) => {
                          const slot = availableSlots.find((s) => s.id === parseInt(e.target.value));
                          if (slot) {
                            setFormData({
                              ...formData,
                              slot_id: slot.id,
                              appointment_time: slot.start_time.substring(0, 5),
                              staff_id: slot.staff_id || formData.staff_id,
                            });
                          } else {
                            setFormData({ ...formData, slot_id: e.target.value });
                          }
                        }}
                        style={{ ...selectBaseStyle, width: "100%" }}
                      >
                        <option value="">Select an open slot...</option>
                        {availableSlots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)} ({s.available_slots} open)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="time"
                        required
                        value={formData.appointment_time}
                        onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                        style={inputBaseStyle}
                      />
                    )}
                  </div>
                </div>

                {/* Duration & Fee */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
                      style={inputBaseStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Fee ($ USD)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={formData.fee}
                      onChange={(e) => setFormData({ ...formData, fee: parseFloat(e.target.value) || 0 })}
                      style={inputBaseStyle}
                    />
                  </div>
                </div>

                {/* Staff Assignment & Channel */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Assigned Staff
                    </label>
                    <select
                      value={formData.staff_id}
                      onChange={(e) => {
                        const newStaff = e.target.value;
                        setFormData({ ...formData, staff_id: newStaff });
                        handleDateOrStaffChangeInModal(formData.appointment_date, newStaff);
                      }}
                      style={{ ...selectBaseStyle, width: "100%" }}
                    >
                      <option value="">Any Staff Member</option>
                      {teamMembers.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name || tm.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                      Booking Channel
                    </label>
                    <select
                      value={formData.channel}
                      onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                      style={{ ...selectBaseStyle, width: "100%" }}
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="FACEBOOK">Facebook Messenger</option>
                      <option value="INSTAGRAM">Instagram</option>
                      <option value="TELEGRAM">Telegram</option>
                      <option value="WEBCHAT">Webchat</option>
                      <option value="MANUAL">Manual / Phone</option>
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 4, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                    Notes & Intake Details
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Add special instructions, client requirements, or intake notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    style={{ ...inputBaseStyle, resize: "vertical" }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewModalOpen(false);
                      setIsEditModalOpen(false);
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 8,
                      border: "none",
                      background: "var(--primary)",
                      color: "#ffffff",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      opacity: modalLoading ? 0.6 : 1,
                    }}
                  >
                    {modalLoading ? "Saving..." : isEditModalOpen ? "Save Changes" : "Schedule Appointment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 3: CANCEL WITH REASON
            ════════════════════════════════════════════════════════════════════ */}
        {isCancelModalOpen && selectedAppointment && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 14,
                width: "100%",
                maxWidth: 440,
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow)",
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "var(--danger)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ban size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Cancel Appointment
                  </h3>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Booking #APT-{selectedAppointment.id} • {selectedAppointment.customer_name}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Cancelling this booking will release its slot back to availability so other clients can schedule into the window.
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                  Select or Enter Cancellation Reason:
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {CANCELLATION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCancellationReason(preset)}
                      style={{
                        textAlign: "left",
                        padding: "6px 12px",
                        fontSize: "0.8rem",
                        borderRadius: 6,
                        border: `1px solid ${cancellationReason === preset ? "var(--danger)" : "var(--border)"}`,
                        background: cancellationReason === preset ? "rgba(239, 68, 68, 0.08)" : "var(--bg-surface)",
                        color: cancellationReason === preset ? "var(--danger)" : "var(--text-primary)",
                        fontWeight: cancellationReason === preset ? 700 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  placeholder="Or type custom reason..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  style={{ ...inputBaseStyle, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Nevermind
                </button>
                <button
                  type="button"
                  disabled={modalLoading}
                  onClick={handleConfirmCancel}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--danger)",
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: modalLoading ? 0.6 : 1,
                  }}
                >
                  {modalLoading ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 4: SHARE BOOKING LINK
            ════════════════════════════════════════════════════════════════════ */}
        {isShareModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 14,
                width: "100%",
                maxWidth: 480,
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow)",
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "var(--bg-hover)",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Share2 size={16} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      Public Booking Portal
                    </h3>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                      Share self-service booking link with your customers
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Share your public booking link on WhatsApp status, Instagram bio, Google Business, or email signatures. Clients can pick open slots directly 24/7.
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 10px",
                }}
              >
                <input
                  type="text"
                  readOnly
                  value={bookingPortalUrl}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    width: "100%",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(bookingPortalUrl);
                    toast.success("Booking URL copied to clipboard!");
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--primary)",
                    color: "#ffffff",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <Copy size={13} /> Copy
                </button>
              </div>

              <div
                style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: "0.78rem",
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--success)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <MessageSquare size={14} /> WhatsApp Automated Trigger
                </div>
                <div style={{ color: "var(--text-secondary)", lineHeight: 1.45 }}>
                  Subscribers can also book directly inside any messaging channel by texting:
                  <code
                    style={{
                      display: "inline-block",
                      marginTop: 4,
                      background: "var(--bg-surface)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    book appointment
                  </code>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <a
                  href={bookingPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  <ExternalLink size={13} /> Open Live Page
                </a>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--primary)",
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
