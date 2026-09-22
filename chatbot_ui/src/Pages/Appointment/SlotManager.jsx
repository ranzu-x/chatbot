import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import AppLayout from "../../Layout/AppLayout";
import toast from "react-hot-toast";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  RefreshCw,
  ArrowLeft,
  ToggleLeft,
  ToggleRight,
  User,
  Users,
  CheckCircle2,
  Settings,
  Sparkles,
  Layers,
  Edit2,
  AlertCircle,
  Briefcase,
  DollarSign,
  CalendarDays,
  Check,
  X,
  Sliders,
} from "lucide-react";
import {
  fetchSlots,
  createSlots,
  updateSlot,
  deleteSlot,
  toggleSlot,
  bulkDeleteSlots,
  bulkToggleSlots,
  purgePastSlots,
  fetchAppointmentServices,
  createAppointmentService,
  updateAppointmentService,
  deleteAppointmentService,
} from "../../services/appointmentService";
import api from "../../services/api";

const DAYS_OF_WEEK = [
  { id: 1, label: "Mon", name: "Monday" },
  { id: 2, label: "Tue", name: "Tuesday" },
  { id: 3, label: "Wed", name: "Wednesday" },
  { id: 4, label: "Thu", name: "Thursday" },
  { id: 5, label: "Fri", name: "Friday" },
  { id: 6, label: "Sat", name: "Saturday" },
  { id: 0, label: "Sun", name: "Sunday" },
];

export default function SlotManager() {
  const [activeTab, setActiveTab] = useState("slots"); // 'slots' | 'services' | 'schedule'
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState(new Set());

  // Services State
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    name: "",
    description: "",
    duration_minutes: 30,
    price: 0,
    currency: "USD",
    color: "#6366f1",
    is_active: 1,
  });

  // Generate slots modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [genMode, setGenMode] = useState("range"); // 'single' | 'range'
  const [genForm, setGenForm] = useState({
    slot_date: new Date().toISOString().split("T")[0],
    fromDate: new Date().toISOString().split("T")[0],
    toDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
    start_time: "09:00",
    end_time: "17:00",
    slot_duration: 30,
    max_capacity: 1,
    staffId: "",
    break_start: "13:00",
    break_end: "14:00",
  });

  // Edit slot modal state
  const [editSlotModalOpen, setEditSlotModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [editForm, setEditForm] = useState({
    start_time: "",
    end_time: "",
    max_capacity: 1,
    staff_id: "",
    is_active: 1,
  });

  // Weekly Schedule Template
  const [weeklySchedule, setWeeklySchedule] = useState({
    1: { active: true, start: "09:00", end: "17:00" },
    2: { active: true, start: "09:00", end: "17:00" },
    3: { active: true, start: "09:00", end: "17:00" },
    4: { active: true, start: "09:00", end: "17:00" },
    5: { active: true, start: "09:00", end: "17:00" },
    6: { active: false, start: "10:00", end: "15:00" },
    0: { active: false, start: "10:00", end: "15:00" },
  });
  const [applyingSchedule, setApplyingSchedule] = useState(false);

  // ── Loaders ─────────────────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedDate) params.date = selectedDate;
      if (selectedStaff) params.staffId = selectedStaff;
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      const res = await fetchSlots(params);
      setSlots(res.slots || []);
      setSelectedSlotIds(new Set());
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to load slots");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedStaff, statusFilter]);

  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const res = await fetchAppointmentServices();
      setServices(res.services || []);
    } catch (err) {
      console.warn("Could not load services:", err);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const loadTeam = async () => {
    try {
      const res = await api.get("/team-members?limit=50");
      setTeamMembers(res.data?.members || res.data?.users || []);
    } catch (err) {
      console.warn("Could not load team:", err);
    }
  };

  useEffect(() => {
    loadSlots();
    loadServices();
    loadTeam();
  }, [loadSlots, loadServices]);

  // ── Generate Slots Handler ──────────────────────────────────────────────
  const handleGenerateSlots = async (e) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      const payload = {
        ...genForm,
        staffId: genForm.staffId || null,
        slot_duration: parseInt(genForm.slot_duration) || 30,
        max_capacity: parseInt(genForm.max_capacity) || 1,
      };

      if (genMode === "single") {
        delete payload.fromDate;
        delete payload.toDate;
        delete payload.daysOfWeek;
      } else {
        delete payload.slot_date;
      }

      const res = await createSlots(payload);
      toast.success(res.message || "Slots generated successfully!");
      setIsModalOpen(false);
      loadSlots();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to generate slots");
    } finally {
      setModalLoading(false);
    }
  };

  // ── Apply Weekly Schedule ──────────────────────────────────────────────
  const handleApplyWeeklySchedule = async (daysAhead = 30) => {
    if (!window.confirm(`Generate slots for the next ${daysAhead} days based on your weekly working hours?`)) return;

    setApplyingSchedule(true);
    try {
      const fromDate = new Date().toISOString().split("T")[0];
      const toDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Generate for each active day
      let totalCreated = 0;
      for (const [dayKey, conf] of Object.entries(weeklySchedule)) {
        if (!conf.active) continue;
        const res = await createSlots({
          fromDate,
          toDate,
          daysOfWeek: [parseInt(dayKey)],
          start_time: conf.start,
          end_time: conf.end,
          slot_duration: 30,
          max_capacity: 1,
          break_start: "13:00",
          break_end: "14:00",
        });
        totalCreated += res.count || 0;
      }

      toast.success(`Schedule applied! Created ${totalCreated} total slots.`);
      loadSlots();
      setActiveTab("slots");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to apply schedule");
    } finally {
      setApplyingSchedule(false);
    }
  };

  // ── Slot Actions ────────────────────────────────────────────────────────
  const handleDeleteSlot = async (id) => {
    if (!window.confirm("Delete this time slot?")) return;
    try {
      await deleteSlot(id);
      toast.success("Slot deleted");
      loadSlots();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete slot");
    }
  };

  const handleToggleSlot = async (id) => {
    try {
      await toggleSlot(id);
      loadSlots();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to toggle slot");
    }
  };

  const openEditSlot = (slot) => {
    setEditingSlot(slot);
    setEditForm({
      start_time: slot.start_time?.substring(0, 5) || "09:00",
      end_time: slot.end_time?.substring(0, 5) || "09:30",
      max_capacity: slot.max_capacity || 1,
      staff_id: slot.staff_id || "",
      is_active: slot.is_active ? 1 : 0,
    });
    setEditSlotModalOpen(true);
  };

  const handleSaveSlotEdit = async (e) => {
    e.preventDefault();
    try {
      await updateSlot(editingSlot.id, editForm);
      toast.success("Slot updated successfully");
      setEditSlotModalOpen(false);
      loadSlots();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update slot");
    }
  };

  // ── Bulk Actions ────────────────────────────────────────────────────────
  const toggleSelectSlot = (id) => {
    const next = new Set(selectedSlotIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSlotIds(next);
  };

  const selectAllSlots = () => {
    if (selectedSlotIds.size === slots.length) {
      setSelectedSlotIds(new Set());
    } else {
      setSelectedSlotIds(new Set(slots.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedSlotIds.size} selected slots? (Booked slots will be protected)`)) return;
    try {
      const res = await bulkDeleteSlots(Array.from(selectedSlotIds));
      toast.success(res.message || "Slots deleted");
      loadSlots();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete slots");
    }
  };

  const handleBulkToggle = async (active) => {
    try {
      await bulkToggleSlots(Array.from(selectedSlotIds), active);
      toast.success(`Slots marked as ${active ? "active" : "inactive"}`);
      loadSlots();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to toggle slots");
    }
  };

  const handlePurgePast = async () => {
    if (!window.confirm("Clean up past empty slots before today?")) return;
    try {
      const res = await purgePastSlots();
      toast.success(res.message || "Cleaned up past slots");
      loadSlots();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to purge past slots");
    }
  };

  // ── Service Handlers ────────────────────────────────────────────────────
  const openNewService = () => {
    setEditingService(null);
    setServiceForm({
      name: "",
      description: "",
      duration_minutes: 30,
      price: 0,
      currency: "USD",
      color: "#6366f1",
      is_active: 1,
    });
    setServiceModalOpen(true);
  };

  const openEditService = (svc) => {
    setEditingService(svc);
    setServiceForm({
      name: svc.name || "",
      description: svc.description || "",
      duration_minutes: svc.duration_minutes || 30,
      price: svc.price || 0,
      currency: svc.currency || "USD",
      color: svc.color || "#6366f1",
      is_active: svc.is_active ? 1 : 0,
    });
    setServiceModalOpen(true);
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    try {
      if (editingService) {
        await updateAppointmentService(editingService.id, serviceForm);
        toast.success("Service updated successfully");
      } else {
        await createAppointmentService(serviceForm);
        toast.success("Service created successfully");
      }
      setServiceModalOpen(false);
      loadServices();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save service");
    }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm("Are you sure you want to delete this service?")) return;
    try {
      await deleteAppointmentService(id);
      toast.success("Service deleted");
      loadServices();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete service");
    }
  };

  // Quick stats
  const totalSlotsCount = slots.length;
  const availableSlotsCount = slots.filter((s) => s.is_active && s.booked_count < s.max_capacity).length;
  const bookedSlotsCount = slots.filter((s) => s.booked_count > 0).length;

  return (
    <AppLayout>
      <div className="w-full p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                to="/appointments"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
              >
                <ArrowLeft size={16} />
              </Link>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                Slot Manager & Availability
              </h1>
            </div>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Configure available windows for automated WhatsApp, Facebook, Instagram & omnichannel booking.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {activeTab === "slots" && (
              <>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
                >
                  <Plus size={15} /> Generate Slots
                </button>
                <button
                  onClick={handlePurgePast}
                  title="Purge empty past slots"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition"
                >
                  <Trash2 size={13} /> Clean Past
                </button>
              </>
            )}
            {activeTab === "services" && (
              <button
                onClick={openNewService}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
              >
                <Plus size={15} /> Add Service
              </button>
            )}
            <button
              onClick={() => {
                loadSlots();
                loadServices();
              }}
              title="Refresh"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition"
            >
              <RefreshCw size={15} className={loading || servicesLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("slots")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs md:text-sm font-bold border-b-2 transition ${
              activeTab === "slots"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Clock size={16} /> Calendar Slots ({slots.length})
          </button>
          <button
            onClick={() => setActiveTab("services")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs md:text-sm font-bold border-b-2 transition ${
              activeTab === "services"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Briefcase size={16} /> Services Catalog ({services.length})
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs md:text-sm font-bold border-b-2 transition ${
              activeTab === "schedule"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <CalendarDays size={16} /> Weekly Working Hours
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1: SLOTS
            ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "slots" && (
          <div className="space-y-4">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400">Total Slots</p>
                  <p className="text-lg font-extrabold text-slate-800">{totalSlotsCount}</p>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400">Available</p>
                  <p className="text-lg font-extrabold text-slate-800">{availableSlotsCount}</p>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                  <Users size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400">Booked</p>
                  <p className="text-lg font-extrabold text-slate-800">{bookedSlotsCount}</p>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                  <Briefcase size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400">Active Services</p>
                  <p className="text-lg font-extrabold text-slate-800">
                    {services.filter((s) => s.is_active).length}
                  </p>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                  <Calendar size={14} /> Filter Date:
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  Today
                </button>
                <button
                  onClick={() => setSelectedDate("")}
                  className="text-[11px] font-semibold text-slate-500 hover:underline"
                >
                  All Dates
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                  <User size={14} /> Staff:
                </div>
                <select
                  value={selectedStaff}
                  onChange={(e) => setSelectedStaff(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">All Team Members</option>
                  {teamMembers.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name || tm.email}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Status</option>
                  <option value="available">Available Only</option>
                  <option value="full">Full Only</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>

            {/* Bulk Actions Header */}
            {selectedSlotIds.size > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-indigo-900 font-bold">
                  <CheckCircle2 size={16} />
                  <span>{selectedSlotIds.size} slot(s) selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBulkToggle(1)}
                    className="px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-indigo-700 font-bold hover:bg-indigo-100 transition"
                  >
                    Activate
                  </button>
                  <button
                    onClick={() => handleBulkToggle(0)}
                    className="px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-indigo-700 font-bold hover:bg-indigo-100 transition"
                  >
                    Deactivate
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition"
                  >
                    Delete Selected
                  </button>
                </div>
              </div>
            )}

            {/* Slots Grid */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Clock size={16} className="text-indigo-600" />
                  Available Time Windows ({slots.length})
                </h3>
                {slots.length > 0 && (
                  <button
                    onClick={selectAllSlots}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    {selectedSlotIds.size === slots.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mb-2"></div>
                  <p className="text-xs">Loading slots...</p>
                </div>
              ) : slots.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Clock size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-xs text-slate-600">No time slots found</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Click "Generate Slots" to create intervals for automated booking.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {slots.map((s) => {
                    const isFull = s.booked_count >= s.max_capacity;
                    const isSelected = selectedSlotIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isSelected
                            ? "bg-indigo-50/60 border-indigo-400 shadow-sm"
                            : !s.is_active
                            ? "bg-slate-50 border-slate-200 opacity-60"
                            : isFull
                            ? "bg-amber-50/40 border-amber-200"
                            : "bg-white border-slate-200/80 hover:border-indigo-300 shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectSlot(s.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="font-extrabold text-sm text-slate-900">
                              {s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleToggleSlot(s.id)}
                            title={s.is_active ? "Slot Active" : "Slot Inactive"}
                            className="text-slate-400 hover:text-indigo-600 transition"
                          >
                            {s.is_active ? (
                              <ToggleRight size={22} className="text-indigo-600" />
                            ) : (
                              <ToggleLeft size={22} />
                            )}
                          </button>
                        </div>

                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span>Date: <b>{s.slot_date?.substring(0, 10)}</b></span>
                          <span>
                            Capacity:{" "}
                            <b className={isFull ? "text-amber-600" : "text-emerald-600"}>
                              {s.booked_count}/{s.max_capacity}
                            </b>
                          </span>
                        </div>

                        {s.staff_name && (
                          <p className="text-[10px] text-slate-400 mt-1 truncate">
                            Staff: {s.staff_name}
                          </p>
                        )}

                        <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-slate-100 text-[11px]">
                          <button
                            onClick={() => openEditSlot(s)}
                            title="Edit slot"
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteSlot(s.id)}
                            title="Delete slot"
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 2: SERVICES CATALOG
            ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "services" && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Briefcase size={16} className="text-indigo-600" />
                    Bookable Services ({services.length})
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Define services your clients can choose from when booking via WhatsApp, webchat, or booking link.
                  </p>
                </div>
                <button
                  onClick={openNewService}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
                >
                  <Plus size={14} /> Add Service
                </button>
              </div>

              {servicesLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mb-2"></div>
                  <p className="text-xs">Loading services...</p>
                </div>
              ) : services.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Briefcase size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-xs text-slate-600">No custom services defined</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Add services like "General Consultation", "Product Demo", or "Support Call".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:border-indigo-300 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider"
                            style={{
                              backgroundColor: `${svc.color || "#6366f1"}15`,
                              color: svc.color || "#6366f1",
                            }}
                          >
                            {svc.duration_minutes} MINS
                          </span>
                          <span className="font-extrabold text-sm text-slate-900">
                            {parseFloat(svc.price) > 0
                              ? `${svc.currency || "USD"} ${parseFloat(svc.price).toFixed(2)}`
                              : "Free"}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm">{svc.name}</h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {svc.description || "No description provided."}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                        <span className="text-[11px] text-slate-400">
                          {svc.appointment_count || 0} booked
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditService(svc)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteService(svc.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 3: WEEKLY SCHEDULE TEMPLATE
            ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm max-w-3xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <CalendarDays size={16} className="text-indigo-600" />
                    Weekly Working Schedule
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Define default working hours for each day of the week, then click "Apply Schedule" to generate slots automatically.
                  </p>
                </div>
                <button
                  onClick={() => handleApplyWeeklySchedule(30)}
                  disabled={applyingSchedule}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  {applyingSchedule ? "Generating..." : "Apply to Next 30 Days"}
                </button>
              </div>

              <div className="space-y-3">
                {DAYS_OF_WEEK.map((d) => {
                  const conf = weeklySchedule[d.id] || { active: false, start: "09:00", end: "17:00" };
                  return (
                    <div
                      key={d.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                        conf.active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200/60 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 w-32">
                        <input
                          type="checkbox"
                          checked={conf.active}
                          onChange={(e) =>
                            setWeeklySchedule({
                              ...weeklySchedule,
                              [d.id]: { ...conf, active: e.target.checked },
                            })
                          }
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="font-bold text-slate-800">{d.name}</span>
                      </div>

                      {conf.active ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={conf.start}
                            onChange={(e) =>
                              setWeeklySchedule({
                                ...weeklySchedule,
                                [d.id]: { ...conf, start: e.target.value },
                              })
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
                          />
                          <span className="text-slate-400">to</span>
                          <input
                            type="time"
                            value={conf.end}
                            onChange={(e) =>
                              setWeeklySchedule({
                                ...weeklySchedule,
                                [d.id]: { ...conf, end: e.target.value },
                              })
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 1: GENERATE SLOTS
            ════════════════════════════════════════════════════════════════════ */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
              <h3 className="font-extrabold text-slate-800 text-base mb-1 flex items-center gap-2">
                <Clock className="text-indigo-600" size={18} /> Slot Generator
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Generate appointment slots for a single date or across multiple weeks.
              </p>

              {/* Mode Toggle */}
              <div className="flex p-1 bg-slate-100 rounded-xl mb-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setGenMode("range")}
                  className={`flex-1 py-1.5 rounded-lg transition ${
                    genMode === "range" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Date Range (Recurring)
                </button>
                <button
                  type="button"
                  onClick={() => setGenMode("single")}
                  className={`flex-1 py-1.5 rounded-lg transition ${
                    genMode === "single" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Single Date
                </button>
              </div>

              <form onSubmit={handleGenerateSlots} className="space-y-3.5 text-xs">
                {genMode === "single" ? (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Target Date *</label>
                    <input
                      type="date"
                      required
                      value={genForm.slot_date}
                      onChange={(e) => setGenForm({ ...genForm, slot_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">From Date *</label>
                        <input
                          type="date"
                          required
                          value={genForm.fromDate}
                          onChange={(e) => setGenForm({ ...genForm, fromDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">To Date *</label>
                        <input
                          type="date"
                          required
                          value={genForm.toDate}
                          onChange={(e) => setGenForm({ ...genForm, toDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-700">Days of Week</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setGenForm({ ...genForm, daysOfWeek: [1, 2, 3, 4, 5] })}
                            className="text-[10px] text-indigo-600 font-bold hover:underline"
                          >
                            Weekdays
                          </button>
                          <button
                            type="button"
                            onClick={() => setGenForm({ ...genForm, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })}
                            className="text-[10px] text-indigo-600 font-bold hover:underline"
                          >
                            All Days
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((d) => {
                          const isChecked = genForm.daysOfWeek.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => {
                                const current = genForm.daysOfWeek;
                                const next = isChecked
                                  ? current.filter((x) => x !== d.id)
                                  : [...current, d.id];
                                setGenForm({ ...genForm, daysOfWeek: next });
                              }}
                              className={`px-3 py-1.5 rounded-xl font-bold border transition ${
                                isChecked
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-slate-50 text-slate-600 border-slate-200"
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={genForm.start_time}
                      onChange={(e) => setGenForm({ ...genForm, start_time: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">End Time *</label>
                    <input
                      type="time"
                      required
                      value={genForm.end_time}
                      onChange={(e) => setGenForm({ ...genForm, end_time: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Slot Duration</label>
                    <select
                      value={genForm.slot_duration}
                      onChange={(e) => setGenForm({ ...genForm, slot_duration: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                    >
                      <option value="15">15 mins</option>
                      <option value="30">30 mins</option>
                      <option value="45">45 mins</option>
                      <option value="60">60 mins (1 hr)</option>
                      <option value="90">90 mins</option>
                      <option value="120">120 mins (2 hrs)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Capacity per Slot</label>
                    <input
                      type="number"
                      min="1"
                      value={genForm.max_capacity}
                      onChange={(e) => setGenForm({ ...genForm, max_capacity: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Break Start (optional)</label>
                    <input
                      type="time"
                      value={genForm.break_start}
                      onChange={(e) => setGenForm({ ...genForm, break_start: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Break End (optional)</label>
                    <input
                      type="time"
                      value={genForm.break_end}
                      onChange={(e) => setGenForm({ ...genForm, break_end: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assign Staff (optional)</label>
                  <select
                    value={genForm.staffId}
                    onChange={(e) => setGenForm({ ...genForm, staffId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                  >
                    <option value="">Any Staff Member (General Pool)</option>
                    {teamMembers.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name || tm.email}
                      </option>
                    ))}
                  </select>
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
                    {modalLoading ? "Generating..." : "Generate Slots"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 2: EDIT SLOT
            ════════════════════════════════════════════════════════════════════ */}
        {editSlotModalOpen && editingSlot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
              <h3 className="font-extrabold text-slate-800 text-base mb-3 flex items-center gap-2">
                <Edit2 className="text-indigo-600" size={16} /> Edit Slot
              </h3>

              <form onSubmit={handleSaveSlotEdit} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Start Time</label>
                    <input
                      type="time"
                      required
                      value={editForm.start_time}
                      onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">End Time</label>
                    <input
                      type="time"
                      required
                      value={editForm.end_time}
                      onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Max Capacity</label>
                  <input
                    type="number"
                    min={editingSlot.booked_count || 1}
                    value={editForm.max_capacity}
                    onChange={(e) => setEditForm({ ...editForm, max_capacity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Currently booked: {editingSlot.booked_count}
                  </p>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Staff Member</label>
                  <select
                    value={editForm.staff_id}
                    onChange={(e) => setEditForm({ ...editForm, staff_id: e.target.value })}
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

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditSlotModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MODAL 3: ADD/EDIT SERVICE
            ════════════════════════════════════════════════════════════════════ */}
        {serviceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
              <h3 className="font-extrabold text-slate-800 text-base mb-3 flex items-center gap-2">
                <Briefcase className="text-indigo-600" size={18} />
                {editingService ? "Edit Service" : "Add Bookable Service"}
              </h3>

              <form onSubmit={handleSaveService} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Service Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. General Consultation, Dental Checkup"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Description (optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Brief explanation of what this service covers..."
                    value={serviceForm.description}
                    onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Duration (minutes) *</label>
                    <select
                      value={serviceForm.duration_minutes}
                      onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      <option value="15">15 mins</option>
                      <option value="30">30 mins</option>
                      <option value="45">45 mins</option>
                      <option value="60">60 mins</option>
                      <option value="90">90 mins</option>
                      <option value="120">120 mins</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Price / Fee</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={serviceForm.price}
                        onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                      />
                      <select
                        value={serviceForm.currency}
                        onChange={(e) => setServiceForm({ ...serviceForm, currency: e.target.value })}
                        className="px-2 py-2 rounded-xl border border-slate-200 bg-white"
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="BDT">BDT</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Badge Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={serviceForm.color}
                        onChange={(e) => setServiceForm({ ...serviceForm, color: e.target.value })}
                        className="h-8 w-10 p-0 rounded border cursor-pointer"
                      />
                      <span className="text-slate-500 font-mono text-[11px]">{serviceForm.color}</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Status</label>
                    <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                      <input
                        type="checkbox"
                        checked={serviceForm.is_active === 1}
                        onChange={(e) => setServiceForm({ ...serviceForm, is_active: e.target.checked ? 1 : 0 })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-700">Active Service</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setServiceModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-sm"
                  >
                    {editingService ? "Update Service" : "Create Service"}
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
