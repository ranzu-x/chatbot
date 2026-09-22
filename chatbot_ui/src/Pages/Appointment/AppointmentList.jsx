import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import AppLayout from "../../Layout/AppLayout";
import { useAuth } from "../../Provider/AuthContext";
import toast from "react-hot-toast";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Settings,
  Copy,
  ExternalLink,
  MessageSquare,
  Phone,
  User,
  CalendarCheck,
  Check,
  Edit,
  Eye,
  Share2,
  Layers,
  Briefcase,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Send,
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
} from "../../services/appointmentService";
import api from "../../services/api";

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", color: "bg-blue-50 text-blue-700 border-blue-200" },
  confirmed: { label: "Confirmed", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  completed: { label: "Completed", color: "bg-purple-50 text-purple-700 border-purple-200" },
  cancelled: { label: "Cancelled", color: "bg-rose-50 text-rose-700 border-rose-200" },
  no_show: { label: "No Show", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

const CHANNEL_ICONS = {
  WHATSAPP: { label: "WhatsApp", color: "text-emerald-600 bg-emerald-50" },
  FACEBOOK: { label: "Messenger", color: "text-blue-600 bg-blue-50" },
  INSTAGRAM: { label: "Instagram", color: "text-pink-600 bg-pink-50" },
  TELEGRAM: { label: "Telegram", color: "text-sky-600 bg-sky-50" },
  WEBCHAT: { label: "Webchat", color: "text-indigo-600 bg-indigo-50" },
  MANUAL: { label: "Manual", color: "text-slate-600 bg-slate-50" },
};

export default function AppointmentList() {
  const { user } = useAuth();
  const agencyId = user?.agencyId || 1;

  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, scheduled: 0, confirmed: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Aux state
  const [teamMembers, setTeamMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);

  // Form State for New / Edit
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
    channel: "MANUAL",
    status: "scheduled",
    notes: "",
  });

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAppointments({
        page,
        limit: 15,
        search,
        status: statusFilter,
        channel: channelFilter,
        staffId: staffFilter,
        date: dateFilter,
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

  const loadStats = async () => {
    try {
      const res = await fetchAppointmentStats();
      if (res.stats) setStats(res.stats);
    } catch (err) {
      console.warn("Could not load stats:", err);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const res = await api.get("/team-members?limit=50");
      setTeamMembers(res.data?.members || res.data?.users || []);
    } catch (err) {
      console.warn("Could not load team members:", err);
    }
  };

  const loadServices = async () => {
    try {
      const res = await fetchAppointmentServices();
      setServices(res.services || []);
    } catch (err) {
      console.warn("Could not load services:", err);
    }
  };

  useEffect(() => {
    loadAppointments();
    loadStats();
    loadTeamMembers();
    loadServices();
  }, [loadAppointments]);

  // Load available slots when date changes in new/edit modal
  const handleDateChangeInModal = async (date) => {
    setFormData((prev) => ({ ...prev, appointment_date: date, slot_id: "" }));
    if (!agencyId || !date) return;
    try {
      const res = await fetchAvailableSlots(agencyId, date);
      setAvailableSlots(res.slots || []);
    } catch (e) {
      console.warn("Slot fetch failed:", e);
    }
  };

  // Status Change
  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateAppointmentStatus(id, newStatus);
      toast.success(`Appointment marked as ${newStatus}`);
      loadAppointments();
      loadStats();
      if (isDetailModalOpen && selectedAppointment?.id === id) {
        setSelectedAppointment((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  // Delete
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this appointment?")) return;
    try {
      await deleteAppointment(id);
      toast.success("Appointment deleted");
      loadAppointments();
      loadStats();
      setIsDetailModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete appointment");
    }
  };

  // Open Edit Modal
  const openEditModal = (apt) => {
    setSelectedAppointment(apt);
    setFormData({
      customer_name: apt.customer_name || "",
      customer_phone: apt.customer_phone || "",
      customer_email: apt.customer_email || "",
      service_id: apt.service_id || "",
      service_name: apt.service_name || "General Consultation",
      appointment_date: apt.appointment_date?.substring(0, 10) || new Date().toISOString().split("T")[0],
      appointment_time: apt.appointment_time?.substring(0, 5) || "10:00",
      slot_id: apt.slot_id || "",
      staff_id: apt.staff_id || "",
      duration: apt.duration || 30,
      fee: apt.fee || 0,
      channel: apt.channel || "MANUAL",
      status: apt.status || "scheduled",
      notes: apt.notes || "",
    });
    handleDateChangeInModal(apt.appointment_date?.substring(0, 10));
    setIsEditModalOpen(true);
  };

  // Open Detail Modal
  const openDetailModal = (apt) => {
    setSelectedAppointment(apt);
    setIsDetailModalOpen(true);
  };

  // Submit New Appointment
  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.appointment_date || !formData.appointment_time) {
      toast.error("Please fill in customer name, date and time");
      return;
    }

    setModalLoading(true);
    try {
      await createAppointment(formData);
      toast.success("Appointment scheduled successfully!");
      setIsNewModalOpen(false);
      loadAppointments();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to schedule appointment");
    } finally {
      setModalLoading(false);
    }
  };

  // Submit Update Appointment
  const handleUpdateAppointment = async (e) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      await updateAppointment(selectedAppointment.id, formData);
      toast.success("Appointment updated successfully!");
      setIsEditModalOpen(false);
      loadAppointments();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update appointment");
    } finally {
      setModalLoading(false);
    }
  };

  // Service Select in Modal
  const handleServiceSelect = (svcId) => {
    const svc = services.find((s) => s.id === parseInt(svcId));
    if (svc) {
      setFormData((prev) => ({
        ...prev,
        service_id: svc.id,
        service_name: svc.name,
        duration: svc.duration_minutes,
        fee: svc.price,
      }));
    } else {
      setFormData((prev) => ({ ...prev, service_id: "", service_name: "General Consultation" }));
    }
  };

  const bookingPortalUrl = `${window.location.origin}/book/${agencyId}`;

  return (
    <AppLayout>
      <div className="w-full p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
              Appointment & Booking Manager
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Manage scheduled bookings across WhatsApp, Facebook, Instagram, Telegram, and Webchat.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              <Share2 size={14} /> Booking Link
            </button>
            <Link
              to="/appointments/slots"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              <Settings size={14} /> Slot Manager
            </Link>
            <button
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
                  channel: "MANUAL",
                  status: "scheduled",
                  notes: "",
                });
                handleDateChangeInModal(new Date().toISOString().split("T")[0]);
                setIsNewModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus size={15} /> New Appointment
            </button>
            <button
              onClick={() => {
                loadAppointments();
                loadStats();
              }}
              title="Refresh"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-400">Total Bookings</span>
            <p className="text-xl font-extrabold text-slate-800 mt-0.5">{stats.total || 0}</p>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[11px] font-semibold text-indigo-600">Today</span>
            <p className="text-xl font-extrabold text-indigo-600 mt-0.5">{stats.today || 0}</p>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[11px] font-semibold text-blue-600">Scheduled</span>
            <p className="text-xl font-extrabold text-blue-600 mt-0.5">{stats.scheduled || 0}</p>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[11px] font-semibold text-emerald-600">Confirmed</span>
            <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{stats.confirmed || 0}</p>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[11px] font-semibold text-purple-600">Completed</span>
            <p className="text-xl font-extrabold text-purple-600 mt-0.5">{stats.completed || 0}</p>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[11px] font-semibold text-rose-600">Cancelled</span>
            <p className="text-xl font-extrabold text-rose-600 mt-0.5">{stats.cancelled || 0}</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search by client or service..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>

            {/* Channel Filter */}
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="TELEGRAM">Telegram</option>
              <option value="WEBCHAT">Webchat</option>
              <option value="MANUAL">Manual / Agent</option>
            </select>

            {/* Staff Filter */}
            <select
              value={staffFilter}
              onChange={(e) => {
                setStaffFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Staff</option>
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name || tm.email}
                </option>
              ))}
            </select>

            {/* Date Filter */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {dateFilter && (
              <button
                onClick={() => {
                  setDateFilter("");
                  setPage(1);
                }}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                Clear Date
              </button>
            )}
          </div>
        </div>

        {/* Appointments Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-bold">
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Assigned Staff</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mb-2"></div>
                      <p>Loading appointments...</p>
                    </td>
                  </tr>
                ) : appointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <CalendarCheck size={36} className="mx-auto mb-2 opacity-30" />
                      <p className="font-semibold text-slate-600">No appointments found</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Try adjusting your filters, or share your WhatsApp booking link to receive appointments.
                      </p>
                    </td>
                  </tr>
                ) : (
                  appointments.map((apt) => {
                    const statusConf = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;
                    const channelConf = CHANNEL_ICONS[apt.channel] || CHANNEL_ICONS.MANUAL;
                    return (
                      <tr key={apt.id} className="hover:bg-slate-50/80 transition group">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {apt.customer_name ? apt.customer_name.charAt(0).toUpperCase() : "C"}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{apt.customer_name || "Anonymous"}</p>
                              <p className="text-[11px] text-slate-400">
                                {apt.customer_phone || apt.customer_email || "No contact"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            {apt.service_color && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: apt.service_color }}
                              />
                            )}
                            <span className="font-semibold text-slate-800">
                              {apt.service_name || apt.service_catalog_name || "General Consultation"}
                            </span>
                          </div>
                          {apt.duration && (
                            <span className="text-[10px] text-slate-400">{apt.duration} mins</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-900">{apt.appointment_date?.substring(0, 10)}</p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {apt.appointment_time?.substring(0, 5)}
                          </p>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${channelConf.color}`}
                          >
                            {channelConf.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600">
                          {apt.staff_name ? (
                            <div className="flex items-center gap-1 text-[11px]">
                              <User size={12} className="text-slate-400" />
                              <span>{apt.staff_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Unassigned</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusConf.color}`}
                          >
                            {statusConf.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openDetailModal(apt)}
                              title="View Details"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              onClick={() => openEditModal(apt)}
                              title="Edit / Reschedule"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                            >
                              <Edit size={13} />
                            </button>

                            {apt.status === "scheduled" && (
                              <button
                                onClick={() => handleStatusChange(apt.id, "confirmed")}
                                title="Confirm"
                                className="p-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition"
                              >
                                <Check size={13} />
                              </button>
                            )}

                            {apt.status !== "completed" && apt.status !== "cancelled" && (
                              <button
                                onClick={() => handleStatusChange(apt.id, "completed")}
                                title="Mark Completed"
                                className="p-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition"
                              >
                                <CheckCircle2 size={13} />
                              </button>
                            )}

                            <button
                              onClick={() => handleDelete(apt.id)}
                              title="Delete"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
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

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {appointments.length} of {totalItems} bookings
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-bold text-slate-800">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 1: VIEW DETAILS
            ════════════════════════════════════════════════════════════════════ */}
        {isDetailModalOpen && selectedAppointment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Booking #APT-{selectedAppointment.id}
                  </span>
                  <h3 className="font-extrabold text-slate-800 text-base">Appointment Details</h3>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                    (STATUS_CONFIG[selectedAppointment.status] || STATUS_CONFIG.scheduled).color
                  }`}
                >
                  {selectedAppointment.status}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Customer Profile</p>
                  <p className="font-bold text-slate-800 text-sm">{selectedAppointment.customer_name}</p>
                  <p className="text-slate-500">{selectedAppointment.customer_phone || "No phone provided"}</p>
                  {selectedAppointment.customer_email && (
                    <p className="text-slate-500">{selectedAppointment.customer_email}</p>
                  )}
                  {selectedAppointment.customer_phone && (
                    <a
                      href={`https://wa.me/${selectedAppointment.customer_phone.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline pt-1"
                    >
                      <Send size={11} /> Message on WhatsApp
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 border rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Service</span>
                    <strong className="text-slate-800">{selectedAppointment.service_name}</strong>
                  </div>
                  <div className="p-2.5 border rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Duration / Fee</span>
                    <strong className="text-slate-800">
                      {selectedAppointment.duration}m • ${parseFloat(selectedAppointment.fee || 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2.5 border rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Scheduled Date</span>
                    <strong className="text-slate-800">
                      {selectedAppointment.appointment_date?.substring(0, 10)}
                    </strong>
                  </div>
                  <div className="p-2.5 border rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Scheduled Time</span>
                    <strong className="text-slate-800">
                      {selectedAppointment.appointment_time?.substring(0, 5)}
                    </strong>
                  </div>
                </div>

                {selectedAppointment.notes && (
                  <div className="p-2.5 bg-slate-50 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Notes</span>
                    <p className="text-slate-600">{selectedAppointment.notes}</p>
                  </div>
                )}
              </div>

              {/* Status Update Quick Bar */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleStatusChange(selectedAppointment.id, "confirmed")}
                    className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedAppointment.id, "completed")}
                    className="px-2.5 py-1 text-[11px] font-bold bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition"
                  >
                    Complete
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedAppointment.id, "cancelled")}
                    className="px-2.5 py-1 text-[11px] font-bold bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 transition"
                  >
                    Cancel
                  </button>
                </div>

                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 text-xs"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
              <h3 className="font-extrabold text-slate-800 text-base mb-1 flex items-center gap-2">
                <CalendarCheck className="text-indigo-600" size={18} />
                {isEditModalOpen ? "Edit & Reschedule Appointment" : "Create New Appointment"}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Schedule a booking on behalf of a client or update an existing appointment.
              </p>

              <form onSubmit={isEditModalOpen ? handleUpdateAppointment : handleCreateAppointment} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">WhatsApp / Phone *</label>
                    <input
                      type="text"
                      required
                      placeholder="+123456789"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Select Service</label>
                  <select
                    value={formData.service_id}
                    onChange={(e) => handleServiceSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="">Custom / General Consultation</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} ({svc.duration_minutes}m - ${parseFloat(svc.price).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.appointment_date}
                      onChange={(e) => handleDateChangeInModal(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Available Time Slot</label>
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
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      >
                        <option value="">Choose an open slot...</option>
                        {availableSlots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)} ({s.available_slots} available)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="time"
                        required
                        value={formData.appointment_time}
                        onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Assigned Staff</label>
                    <select
                      value={formData.staff_id}
                      onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
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
                    <label className="font-bold text-slate-700 block mb-1">Channel</label>
                    <select
                      value={formData.channel}
                      onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
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

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Notes / Instructions</label>
                  <textarea
                    rows={2}
                    placeholder="Optional notes about this appointment..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewModalOpen(false);
                      setIsEditModalOpen(false);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
                  >
                    {modalLoading ? "Saving..." : isEditModalOpen ? "Save Changes" : "Create Booking"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 3: SHARE BOOKING LINK
            ════════════════════════════════════════════════════════════════════ */}
        {isShareModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Share2 className="text-indigo-600" size={18} /> Omnichannel Booking Link
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-500">
                  Share this public booking link in your WhatsApp bio, Instagram profile, or send it directly in chat conversations.
                </p>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <input
                    type="text"
                    readOnly
                    value={bookingPortalUrl}
                    className="bg-transparent text-slate-700 font-mono text-[11px] w-full focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(bookingPortalUrl);
                      toast.success("Booking URL copied to clipboard!");
                    }}
                    className="p-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shrink-0"
                    title="Copy Link"
                  >
                    <Copy size={13} />
                  </button>
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-900">
                  <p className="font-bold text-xs mb-1">WhatsApp Chat Trigger</p>
                  <p className="text-[11px] text-emerald-700">
                    Clients can also schedule directly on WhatsApp anytime by texting:
                    <br />
                    <code className="font-bold font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-800 mt-1 inline-block">
                      book appointment
                    </code>
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <a
                  href={bookingPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 inline-flex items-center gap-1.5 text-xs"
                >
                  <ExternalLink size={13} /> Open Booking Page
                </a>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900 text-xs"
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
