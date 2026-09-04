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
} from "lucide-react";
import {
  fetchAppointments,
  fetchAppointmentStats,
  updateAppointmentStatus,
  deleteAppointment,
  createAppointment,
  fetchAvailableSlots,
} from "../../services/appointmentService";
import api from "../../services/api";

export default function AppointmentList() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, scheduled: 0, confirmed: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // New appointment modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    service_name: "General Consultation",
    appointment_date: new Date().toISOString().split("T")[0],
    appointment_time: "10:00",
    staff_id: "",
    duration: 30,
    fee: 0,
    channel: "MANUAL",
    notes: "",
  });

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAppointments(page, 15, search);
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
  }, [page, search]);

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

  useEffect(() => {
    loadAppointments();
    loadStats();
    loadTeamMembers();
  }, [loadAppointments]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateAppointmentStatus(id, newStatus);
      toast.success(`Appointment marked as ${newStatus}`);
      loadAppointments();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this appointment?")) return;
    try {
      await deleteAppointment(id);
      toast.success("Appointment deleted");
      loadAppointments();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete appointment");
    }
  };

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
      setIsModalOpen(false);
      setFormData({
        customer_name: "",
        customer_phone: "",
        customer_email: "",
        service_name: "General Consultation",
        appointment_date: new Date().toISOString().split("T")[0],
        appointment_time: "10:00",
        staff_id: "",
        duration: 30,
        fee: 0,
        channel: "MANUAL",
        notes: "",
      });
      loadAppointments();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create appointment");
    } finally {
      setModalLoading(false);
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case "confirmed":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Confirmed</span>;
      case "completed":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Completed</span>;
      case "cancelled":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">Cancelled</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Scheduled</span>;
    }
  };

  const getChannelBadge = (ch) => {
    const colors = {
      WHATSAPP: "bg-green-50 text-green-700 border-green-200",
      FACEBOOK: "bg-blue-50 text-blue-700 border-blue-200",
      INSTAGRAM: "bg-pink-50 text-pink-700 border-pink-200",
      TELEGRAM: "bg-sky-50 text-sky-700 border-sky-200",
      WEBCHAT: "bg-indigo-50 text-indigo-700 border-indigo-200",
      MANUAL: "bg-slate-50 text-slate-700 border-slate-200",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${colors[ch] || colors.MANUAL}`}>
        {ch || "WHATSAPP"}
      </span>
    );
  };

  const filteredAppointments = appointments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (channelFilter !== "all" && a.channel !== channelFilter) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="w-full p-4 md:p-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <CalendarCheck size={20} />
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                Appointment & Booking Manager
              </h1>
            </div>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Manage omnichannel bookings across WhatsApp, Messenger, Instagram, Webchat, and live agents.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <Link
              to="/appointments/slots"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              <Settings size={14} /> Manage Slots
            </Link>

            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus size={15} /> Book Appointment
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

        {/* Stats Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
            <p className="text-2xl font-black text-slate-800 mt-1">{stats.total || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Today</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">{stats.today || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Scheduled</span>
            <p className="text-2xl font-black text-amber-600 mt-1">{stats.scheduled || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Confirmed</span>
            <p className="text-2xl font-black text-blue-600 mt-1">{stats.confirmed || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Completed</span>
            <p className="text-2xl font-black text-purple-600 mt-1">{stats.completed || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Cancelled</span>
            <p className="text-2xl font-black text-rose-500 mt-1">{stats.cancelled || 0}</p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer, phone, service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter size={14} /> Status:
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="TELEGRAM">Telegram</option>
              <option value="WEBCHAT">Webchat</option>
              <option value="MANUAL">Manual / Agent</option>
            </select>
          </div>
        </div>

        {/* Appointments Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Assigned Staff</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs text-slate-700 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mb-2"></div>
                      <p>Loading appointments...</p>
                    </td>
                  </tr>
                ) : filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="font-semibold">No appointments found</p>
                      <p className="text-[11px] mt-1 text-slate-400">
                        Bookings via WhatsApp, webchat, and direct links will appear here automatically.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((apt) => (
                    <tr key={apt.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                            {apt.customer_name?.charAt(0)?.toUpperCase() || "C"}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{apt.customer_name || "Customer"}</p>
                            <p className="text-[11px] text-slate-400 font-normal">{apt.customer_phone || "-"}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">{apt.service_name}</span>
                        {apt.fee > 0 && <span className="text-[11px] text-slate-400 block">${Number(apt.fee).toFixed(2)}</span>}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Calendar size={13} className="text-indigo-500" />
                          {apt.appointment_date}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                          <Clock size={12} />
                          {apt.appointment_time?.substring(0, 5)} ({apt.duration || 30}m)
                        </div>
                      </td>

                      <td className="py-3 px-4">{getChannelBadge(apt.channel)}</td>

                      <td className="py-3 px-4 text-slate-600">
                        {apt.staff_name ? (
                          <span className="inline-flex items-center gap-1">
                            <User size={12} className="text-slate-400" /> {apt.staff_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-3 px-4">{getStatusBadge(apt.status)}</td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {apt.status !== "confirmed" && apt.status !== "completed" && (
                            <button
                              onClick={() => handleStatusChange(apt.id, "confirmed")}
                              title="Confirm"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                          {apt.status === "confirmed" && (
                            <button
                              onClick={() => handleStatusChange(apt.id, "completed")}
                              title="Complete"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                          {apt.status !== "cancelled" && (
                            <button
                              onClick={() => handleStatusChange(apt.id, "cancelled")}
                              title="Cancel"
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition"
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(apt.id)}
                            title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Book Appointment */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <CalendarCheck className="text-indigo-600" size={18} /> Book New Appointment
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition"
                >
                  <XCircle size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateAppointment} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Phone Number</label>
                    <input
                      type="text"
                      placeholder="+1234567890"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Email (optional)</label>
                    <input
                      type="email"
                      placeholder="client@example.com"
                      value={formData.customer_email}
                      onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Service</label>
                    <input
                      type="text"
                      value={formData.service_name}
                      onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Assigned Staff</label>
                    <select
                      value={formData.staff_id}
                      onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                    >
                      <option value="">Any Staff Member</option>
                      {teamMembers.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name || tm.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.appointment_date}
                      onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Time *</label>
                    <input
                      type="time"
                      required
                      value={formData.appointment_time}
                      onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Internal Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Add details, customer preferences, or agenda..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
                  >
                    {modalLoading ? "Booking..." : "Confirm Booking"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
