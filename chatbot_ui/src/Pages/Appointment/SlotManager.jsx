import React, { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router";
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
  Workflow,
  MessageSquare,
  Tag,
  Info,
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
import api, { appointmentCampaignAPI } from "../../services/api";

const DAYS_OF_WEEK = [
  { id: 1, label: "Mon", name: "Monday" },
  { id: 2, label: "Tue", name: "Tuesday" },
  { id: 3, label: "Wed", name: "Wednesday" },
  { id: 4, label: "Thu", name: "Thursday" },
  { id: 5, label: "Fri", name: "Friday" },
  { id: 6, label: "Sat", name: "Saturday" },
  { id: 0, label: "Sun", name: "Sunday" },
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

export default function SlotManager({ defaultTab }) {
  const [searchParams] = useSearchParams();
  const initialTab = defaultTab || (searchParams.get("tab") === "campaigns" ? "campaigns" : "slots");
  const [activeTab, setActiveTab] = useState(initialTab); // 'slots' | 'services' | 'schedule' | 'campaigns'
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

  // Appointment Campaigns State
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
    greeting_message: "👋 Welcome! Please select a service to book your appointment:",
    service_ids: [],
    staff_id: "",
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

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const res = await appointmentCampaignAPI.getAll();
      setCampaigns(res.data?.campaigns || []);
    } catch (err) {
      console.warn("Could not load campaigns:", err);
    } finally {
      setCampaignsLoading(false);
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
    loadCampaigns();
  }, [loadSlots, loadServices, loadCampaigns]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["slots", "services", "schedule", "campaigns"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

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

  // ── Campaign Handlers ──────────────────────────────────────────────────
  const openNewCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm({
      name: "",
      description: "",
      greeting_message: "👋 Welcome! Please select a service to book your appointment:",
      service_ids: [],
      staff_id: "",
      is_active: 1,
    });
    setCampaignModalOpen(true);
  };

  const openEditCampaign = (c) => {
    setEditingCampaign(c);
    let sIds = [];
    try {
      sIds = typeof c.service_ids === "string" ? JSON.parse(c.service_ids) : (c.service_ids || []);
    } catch {
      sIds = [];
    }
    setCampaignForm({
      name: c.name || "",
      description: c.description || "",
      greeting_message: c.greeting_message || "",
      service_ids: sIds,
      staff_id: c.staff_id || "",
      is_active: c.is_active !== undefined ? c.is_active : 1,
    });
    setCampaignModalOpen(true);
  };

  const handleSaveCampaign = async (e) => {
    e.preventDefault();
    if (!campaignForm.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    try {
      const payload = {
        name: campaignForm.name.trim(),
        description: campaignForm.description.trim() || null,
        greeting_message: campaignForm.greeting_message.trim() || null,
        service_ids: campaignForm.service_ids.length > 0 ? campaignForm.service_ids : null,
        staff_id: campaignForm.staff_id ? parseInt(campaignForm.staff_id) : null,
        is_active: campaignForm.is_active ? 1 : 0,
      };
      if (editingCampaign) {
        await appointmentCampaignAPI.update(editingCampaign.id, payload);
        toast.success("Campaign updated successfully");
      } else {
        await appointmentCampaignAPI.create(payload);
        toast.success("Campaign created successfully");
      }
      setCampaignModalOpen(false);
      loadCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save campaign");
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm("Are you sure you want to delete this appointment campaign?")) return;
    try {
      await appointmentCampaignAPI.delete(id);
      toast.success("Campaign deleted");
      loadCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete campaign");
    }
  };

  const handleToggleCampaign = async (c) => {
    try {
      const nextActive = c.is_active ? 0 : 1;
      await appointmentCampaignAPI.update(c.id, { is_active: nextActive });
      toast.success(nextActive ? "Campaign activated" : "Campaign paused");
      loadCampaigns();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  // Quick stats
  const totalSlotsCount = slots.length;
  const availableSlotsCount = slots.filter((s) => s.is_active && s.booked_count < s.max_capacity).length;
  const bookedSlotsCount = slots.filter((s) => s.booked_count > 0).length;
  const activeServicesCount = services.filter((s) => s.is_active).length;

  return (
    <AppLayout>
      <div
        style={{
          padding: "24px 28px",
          maxWidth: 1400,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link
              to="/appointments"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Back to Appointments"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1
                  style={{
                    fontSize: "1.45rem",
                    fontWeight: 800,
                    letterSpacing: "-0.4px",
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  Slot Manager & Availability
                </h1>
              </div>
              <p
                style={{
                  fontSize: "0.83rem",
                  color: "var(--text-secondary)",
                  margin: "4px 0 0",
                }}
              >
                Configure available windows for automated WhatsApp, Facebook, Instagram & omnichannel booking.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {activeTab === "slots" && (
              <>
                <button
                  onClick={() => setIsModalOpen(true)}
                  style={{
                    background: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontWeight: 600,
                    fontSize: "0.83rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                  }}
                >
                  <Plus size={15} /> Generate Slots
                </button>
                <button
                  onClick={handlePurgePast}
                  title="Purge empty past slots"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontWeight: 600,
                    fontSize: "0.83rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={13} /> Clean Past
                </button>
              </>
            )}

            {activeTab === "services" && (
              <button
                onClick={openNewService}
                style={{
                  background: "var(--primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontWeight: 600,
                  fontSize: "0.83rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                <Plus size={15} /> Add Service
              </button>
            )}

            {activeTab === "schedule" && (
              <button
                onClick={() => handleApplyWeeklySchedule(30)}
                disabled={applyingSchedule}
                style={{
                  background: "var(--primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontWeight: 600,
                  fontSize: "0.83rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  opacity: applyingSchedule ? 0.6 : 1,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                <Sparkles size={14} />
                {applyingSchedule ? "Generating..." : "Apply to Next 30 Days"}
              </button>
            )}

            {activeTab === "campaigns" && (
              <button
                onClick={openNewCampaign}
                style={{
                  background: "var(--primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontWeight: 600,
                  fontSize: "0.83rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                <Plus size={15} /> New Campaign
              </button>
            )}

            <button
              onClick={() => {
                loadSlots();
                loadServices();
                loadCampaigns();
              }}
              title="Refresh"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={15} className={loading || servicesLoading || campaignsLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 0,
          }}
        >
          <button
            onClick={() => setActiveTab("slots")}
            style={{
              padding: "10px 16px",
              fontSize: "0.85rem",
              fontWeight: 700,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "slots" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "slots" ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <Clock size={16} /> Calendar Slots ({slots.length})
          </button>
          <button
            onClick={() => setActiveTab("services")}
            style={{
              padding: "10px 16px",
              fontSize: "0.85rem",
              fontWeight: 700,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "services" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "services" ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <Briefcase size={16} /> Services Catalog ({services.length})
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            style={{
              padding: "10px 16px",
              fontSize: "0.85rem",
              fontWeight: 700,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "schedule" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "schedule" ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <CalendarDays size={16} /> Weekly Working Hours
          </button>
          <button
            onClick={() => setActiveTab("campaigns")}
            style={{
              padding: "10px 16px",
              fontSize: "0.85rem",
              fontWeight: 700,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "campaigns" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "campaigns" ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <Workflow size={16} /> Flow Campaigns ({campaigns.length})
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1: SLOTS
            ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "slots" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Quick Metrics */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <StatCard icon={Clock} title="Total Slots" value={totalSlotsCount} color="#6366f1" />
              <StatCard icon={CheckCircle2} title="Available" value={availableSlotsCount} color="#10b981" />
              <StatCard icon={Users} title="Booked" value={bookedSlotsCount} color="#f59e0b" />
              <StatCard icon={Briefcase} title="Active Services" value={activeServicesCount} color="#3b82f6" />
            </div>

            {/* Filter Toolbar */}
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Calendar size={14} /> Filter Date:
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    ...inputBaseStyle,
                    width: "auto",
                    height: 36,
                    padding: "5px 10px",
                  }}
                />
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Today
                </button>
                <button
                  onClick={() => setSelectedDate("")}
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  All Dates
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <User size={14} style={{ color: "var(--text-muted)" }} />
                  <select
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                    style={selectBaseStyle}
                  >
                    <option value="">All Team Members</option>
                    {teamMembers.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name || tm.email}
                      </option>
                    ))}
                  </select>
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={selectBaseStyle}
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
              <div
                style={{
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  padding: "10px 18px",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    color: "var(--primary)",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{selectedSlotIds.size} slot(s) selected</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => handleBulkToggle(1)}
                    style={{
                      padding: "6px 12px",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    Activate
                  </button>
                  <button
                    onClick={() => handleBulkToggle(0)}
                    style={{
                      padding: "6px 12px",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    Deactivate
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    style={{
                      padding: "6px 12px",
                      background: "#ef4444",
                      border: "none",
                      borderRadius: 6,
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    Delete Selected
                  </button>
                </div>
              </div>
            )}

            {/* Slots Grid Container */}
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                padding: "20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: "0.92rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Clock size={16} style={{ color: "var(--primary)" }} />
                  Available Time Windows ({slots.length})
                </h3>
                {slots.length > 0 && (
                  <button
                    onClick={selectAllSlots}
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--primary)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {selectedSlotIds.size === slots.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              {loading ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <div
                    style={{
                      display: "inline-block",
                      width: 24,
                      height: 24,
                      border: "2px solid var(--border)",
                      borderTopColor: "var(--primary)",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      marginBottom: 10,
                    }}
                  />
                  <p style={{ fontSize: "0.82rem", margin: 0 }}>Loading slots...</p>
                </div>
              ) : slots.length === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <Clock size={36} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                  <p style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}>
                    No time slots found
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                    Click "+ Generate Slots" to create intervals for automated booking.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 14,
                  }}
                >
                  {slots.map((s) => {
                    const isFull = s.booked_count >= s.max_capacity;
                    const isSelected = selectedSlotIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: "14px 16px",
                          borderRadius: 10,
                          border: isSelected
                            ? "1px solid var(--primary)"
                            : "1px solid var(--border)",
                          background: isSelected
                            ? "rgba(99, 102, 241, 0.05)"
                            : !s.is_active
                            ? "var(--bg-hover)"
                            : isFull
                            ? "rgba(245, 158, 11, 0.05)"
                            : "var(--bg-surface)",
                          opacity: !s.is_active ? 0.65 : 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectSlot(s.id)}
                              style={{ cursor: "pointer", width: 15, height: 15 }}
                            />
                            <span
                              style={{
                                fontWeight: 800,
                                fontSize: "0.95rem",
                                color: "var(--text-primary)",
                                letterSpacing: "-0.2px",
                              }}
                            >
                              {s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)}
                            </span>
                          </div>

                          <button
                            onClick={() => handleToggleSlot(s.id)}
                            title={s.is_active ? "Slot Active (Click to disable)" : "Slot Inactive (Click to enable)"}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                              color: s.is_active ? "var(--primary)" : "var(--text-muted)",
                            }}
                          >
                            {s.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                          </button>
                        </div>

                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            Date: <b style={{ color: "var(--text-primary)" }}>{s.slot_date?.substring(0, 10)}</b>
                          </span>
                          <span>
                            Capacity:{" "}
                            <b style={{ color: isFull ? "#f59e0b" : "#10b981" }}>
                              {s.booked_count}/{s.max_capacity}
                            </b>
                          </span>
                        </div>

                        {s.staff_name && (
                          <div
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--text-muted)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            Staff: {s.staff_name}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 8,
                            paddingTop: 8,
                            borderTop: "1px solid var(--border-subtle, var(--border))",
                          }}
                        >
                          <button
                            onClick={() => openEditSlot(s)}
                            title="Edit slot"
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
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteSlot(s.id)}
                            title="Delete slot"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: "1px solid rgba(239, 68, 68, 0.2)",
                              background: "rgba(239, 68, 68, 0.05)",
                              color: "#ef4444",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            <Trash2 size={12} />
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                padding: "20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Briefcase size={16} style={{ color: "var(--primary)" }} />
                    Bookable Services ({services.length})
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                    Define services your clients can choose from when booking via WhatsApp, webchat, or booking link.
                  </p>
                </div>
                <button
                  onClick={openNewService}
                  style={{
                    background: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> Add Service
                </button>
              </div>

              {servicesLoading ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <div
                    style={{
                      display: "inline-block",
                      width: 24,
                      height: 24,
                      border: "2px solid var(--border)",
                      borderTopColor: "var(--primary)",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      marginBottom: 10,
                    }}
                  />
                  <p style={{ fontSize: "0.82rem", margin: 0 }}>Loading services...</p>
                </div>
              ) : services.length === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <Briefcase size={36} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                  <p style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}>
                    No custom services defined
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                    Add services like "General Consultation", "Product Demo", or "Support Call".
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                    gap: 16,
                  }}
                >
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      style={{
                        padding: "16px 18px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--bg-surface)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 12,
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 20,
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              letterSpacing: "0.4px",
                              textTransform: "uppercase",
                              backgroundColor: `${svc.color || "#6366f1"}15`,
                              color: svc.color || "#6366f1",
                            }}
                          >
                            {svc.duration_minutes} MINS
                          </span>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: "0.9rem",
                              color: "var(--text-primary)",
                            }}
                          >
                            {parseFloat(svc.price) > 0
                              ? `${svc.currency || "USD"} ${parseFloat(svc.price).toFixed(2)}`
                              : "Free"}
                          </span>
                        </div>
                        <h4
                          style={{
                            fontSize: "0.92rem",
                            fontWeight: 700,
                            color: "var(--text-primary)",
                            margin: "0 0 6px",
                          }}
                        >
                          {svc.name}
                        </h4>
                        <p
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-secondary)",
                            lineHeight: 1.45,
                            margin: 0,
                          }}
                        >
                          {svc.description || "No description provided."}
                        </p>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: 10,
                          borderTop: "1px solid var(--border-subtle, var(--border))",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {svc.appointment_count || 0} booked
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            onClick={() => openEditService(svc)}
                            title="Edit Service"
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
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteService(svc.id)}
                            title="Delete Service"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: "1px solid rgba(239, 68, 68, 0.2)",
                              background: "rgba(239, 68, 68, 0.05)",
                              color: "#ef4444",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                padding: "20px",
                maxWidth: 800,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <CalendarDays size={16} style={{ color: "var(--primary)" }} />
                    Weekly Working Schedule
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                    Define standard working hours for each day of the week, then apply to automatically generate calendar slots.
                  </p>
                </div>
                <button
                  onClick={() => handleApplyWeeklySchedule(30)}
                  disabled={applyingSchedule}
                  style={{
                    background: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    opacity: applyingSchedule ? 0.6 : 1,
                  }}
                >
                  <Sparkles size={14} />
                  {applyingSchedule ? "Generating..." : "Apply to Next 30 Days"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {DAYS_OF_WEEK.map((d) => {
                  const conf = weeklySchedule[d.id] || { active: false, start: "09:00", end: "17:00" };
                  return (
                    <div
                      key={d.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: conf.active ? "var(--bg-surface)" : "var(--bg-hover)",
                        opacity: conf.active ? 1 : 0.6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.82rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, width: 140 }}>
                        <input
                          type="checkbox"
                          checked={conf.active}
                          onChange={(e) =>
                            setWeeklySchedule({
                              ...weeklySchedule,
                              [d.id]: { ...conf, active: e.target.checked },
                            })
                          }
                          style={{ cursor: "pointer", width: 16, height: 16 }}
                        />
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{d.name}</span>
                      </div>

                      {conf.active ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="time"
                            value={conf.start}
                            onChange={(e) =>
                              setWeeklySchedule({
                                ...weeklySchedule,
                                [d.id]: { ...conf, start: e.target.value },
                              })
                            }
                            style={{
                              ...inputBaseStyle,
                              width: 110,
                              height: 34,
                              padding: "4px 8px",
                            }}
                          />
                          <span style={{ color: "var(--text-muted)" }}>to</span>
                          <input
                            type="time"
                            value={conf.end}
                            onChange={(e) =>
                              setWeeklySchedule({
                                ...weeklySchedule,
                                [d.id]: { ...conf, end: e.target.value },
                              })
                            }
                            style={{
                              ...inputBaseStyle,
                              width: 110,
                              height: 34,
                              padding: "4px 8px",
                            }}
                          />
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 4: APPOINTMENT CAMPAIGNS
            ════════════════════════════════════════════════════════════════════ */}
        {activeTab === "campaigns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                padding: "20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Workflow size={16} style={{ color: "var(--primary)" }} />
                    Flow Booking Campaigns ({campaigns.length})
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                    Configure appointment campaigns for Visual Flow Builder nodes. Select which services to include and set a custom greeting.
                  </p>
                </div>
                <button
                  onClick={openNewCampaign}
                  style={{
                    background: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} /> New Campaign
                </button>
              </div>

              {campaignsLoading ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <div
                    style={{
                      display: "inline-block",
                      width: 24,
                      height: 24,
                      border: "2px solid var(--border)",
                      borderTopColor: "var(--primary)",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      marginBottom: 10,
                    }}
                  />
                  <p style={{ fontSize: "0.82rem", margin: 0 }}>Loading campaigns...</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <Workflow size={36} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                  <p style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}>
                    No appointment campaigns created yet
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, maxWidth: 420, margin: "4px auto 16px" }}>
                    Create a campaign to restrict which services appear in WhatsApp flow booking nodes, or to send a personalized greeting message.
                  </p>
                  <button
                    onClick={openNewCampaign}
                    style={{
                      background: "var(--primary)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                    }}
                  >
                    Create First Campaign
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: 16,
                  }}
                >
                  {campaigns.map((camp) => {
                    let sIds = [];
                    try {
                      sIds = typeof camp.service_ids === "string" ? JSON.parse(camp.service_ids) : (camp.service_ids || []);
                    } catch {
                      sIds = [];
                    }
                    const selectedServices = services.filter((s) => sIds.includes(s.id));
                    const assignedStaff = teamMembers.find((m) => m.id === camp.staff_id);

                    return (
                      <div
                        key={camp.id}
                        style={{
                          background: "var(--bg-surface)",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          padding: 16,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: 12,
                          boxShadow: "var(--shadow-sm)",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                            <div>
                              <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                                {camp.name}
                              </h4>
                              {camp.description && (
                                <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                                  {camp.description}
                                </p>
                              )}
                            </div>
                            <span
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 6,
                                background: camp.is_active ? "rgba(16, 185, 129, 0.1)" : "rgba(100, 116, 139, 0.1)",
                                color: camp.is_active ? "var(--success)" : "var(--text-muted)",
                                border: camp.is_active ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid var(--border)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {camp.is_active ? "Active" : "Paused"}
                            </span>
                          </div>

                          {/* Greeting Bubble */}
                          {camp.greeting_message && (
                            <div
                              style={{
                                marginTop: 10,
                                padding: "8px 12px",
                                borderRadius: 8,
                                background: "var(--bg-hover)",
                                border: "1px solid var(--border)",
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 6,
                              }}
                            >
                              <MessageSquare size={13} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
                              <span style={{ fontStyle: "italic", wordBreak: "break-word" }}>
                                "{camp.greeting_message}"
                              </span>
                            </div>
                          )}

                          {/* Services Included */}
                          <div style={{ marginTop: 10 }}>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              Included Services:
                            </span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {sIds.length === 0 ? (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    background: "rgba(99, 102, 241, 0.08)",
                                    color: "var(--primary)",
                                    border: "1px solid rgba(99, 102, 241, 0.18)",
                                    fontWeight: 600,
                                  }}
                                >
                                  All Active Services ({services.length})
                                </span>
                              ) : (
                                selectedServices.map((svc) => (
                                  <span
                                    key={svc.id}
                                    style={{
                                      fontSize: "0.72rem",
                                      padding: "2px 8px",
                                      borderRadius: 4,
                                      background: "var(--bg-hover)",
                                      color: "var(--text-primary)",
                                      border: "1px solid var(--border)",
                                      fontWeight: 500,
                                    }}
                                  >
                                    {svc.name}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Staff Assigned */}
                          {assignedStaff && (
                            <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                              <User size={12} /> Assigned Staff: <strong>{assignedStaff.name || assignedStaff.email}</strong>
                            </div>
                          )}
                        </div>

                        {/* Card Actions */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderTop: "1px solid var(--border)",
                            paddingTop: 10,
                            marginTop: 4,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleCampaign(camp)}
                            style={{
                              background: "none",
                              border: "none",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: camp.is_active ? "var(--text-muted)" : "var(--primary)",
                              cursor: "pointer",
                              padding: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {camp.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                            {camp.is_active ? "Pause" : "Activate"}
                          </button>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={() => openEditCampaign(camp)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid var(--border)",
                                background: "var(--bg-surface)",
                                color: "var(--text-secondary)",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteCampaign(camp.id)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid rgba(239, 68, 68, 0.2)",
                                background: "rgba(239, 68, 68, 0.05)",
                                color: "#ef4444",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
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
            MODAL 1: GENERATE SLOTS
            ════════════════════════════════════════════════════════════════════ */}
        {isModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                maxWidth: 540,
                width: "100%",
                padding: 24,
                boxShadow: "var(--shadow-lg)",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Clock size={18} style={{ color: "var(--primary)" }} /> Slot Generator
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0 0 16px" }}>
                Generate appointment slots for a single date or across multiple recurring weeks.
              </p>

              {/* Mode Toggle */}
              <div
                style={{
                  display: "flex",
                  background: "var(--bg-hover)",
                  padding: 4,
                  borderRadius: 10,
                  marginBottom: 16,
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => setGenMode("range")}
                  style={{
                    flex: 1,
                    padding: "7px 12px",
                    borderRadius: 7,
                    border: "none",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: genMode === "range" ? "var(--bg-surface)" : "transparent",
                    color: genMode === "range" ? "var(--primary)" : "var(--text-muted)",
                    boxShadow: genMode === "range" ? "var(--shadow-sm)" : "none",
                  }}
                >
                  Date Range (Recurring)
                </button>
                <button
                  type="button"
                  onClick={() => setGenMode("single")}
                  style={{
                    flex: 1,
                    padding: "7px 12px",
                    borderRadius: 7,
                    border: "none",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: genMode === "single" ? "var(--bg-surface)" : "transparent",
                    color: genMode === "single" ? "var(--primary)" : "var(--text-muted)",
                    boxShadow: genMode === "single" ? "var(--shadow-sm)" : "none",
                  }}
                >
                  Single Date
                </button>
              </div>

              <form onSubmit={handleGenerateSlots} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {genMode === "single" ? (
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Target Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={genForm.slot_date}
                      onChange={(e) => setGenForm({ ...genForm, slot_date: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                          From Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={genForm.fromDate}
                          onChange={(e) => setGenForm({ ...genForm, fromDate: e.target.value })}
                          style={inputBaseStyle}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                          To Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={genForm.toDate}
                          onChange={(e) => setGenForm({ ...genForm, toDate: e.target.value })}
                          style={inputBaseStyle}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                          Days of Week
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setGenForm({ ...genForm, daysOfWeek: [1, 2, 3, 4, 5] })}
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color: "var(--primary)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            Weekdays
                          </button>
                          <button
                            type="button"
                            onClick={() => setGenForm({ ...genForm, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })}
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color: "var(--primary)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            All Days
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                              style={{
                                padding: "6px 12px",
                                borderRadius: 8,
                                border: isChecked ? "1px solid var(--primary)" : "1px solid var(--border)",
                                background: isChecked ? "var(--primary)" : "var(--bg-surface)",
                                color: isChecked ? "#ffffff" : "var(--text-secondary)",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Start Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={genForm.start_time}
                      onChange={(e) => setGenForm({ ...genForm, start_time: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      End Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={genForm.end_time}
                      onChange={(e) => setGenForm({ ...genForm, end_time: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Slot Duration
                    </label>
                    <select
                      value={genForm.slot_duration}
                      onChange={(e) => setGenForm({ ...genForm, slot_duration: e.target.value })}
                      style={{ ...selectBaseStyle, width: "100%" }}
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
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Capacity per Slot
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={genForm.max_capacity}
                      onChange={(e) => setGenForm({ ...genForm, max_capacity: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Break Start (optional)
                    </label>
                    <input
                      type="time"
                      value={genForm.break_start}
                      onChange={(e) => setGenForm({ ...genForm, break_start: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Break End (optional)
                    </label>
                    <input
                      type="time"
                      value={genForm.break_end}
                      onChange={(e) => setGenForm({ ...genForm, break_end: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Assign Staff (optional)
                  </label>
                  <select
                    value={genForm.staffId}
                    onChange={(e) => setGenForm({ ...genForm, staffId: e.target.value })}
                    style={{ ...selectBaseStyle, width: "100%" }}
                  >
                    <option value="">Any Staff Member (General Pool)</option>
                    {teamMembers.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name || tm.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    paddingTop: 16,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-secondary)",
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
                      padding: "8px 18px",
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
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                maxWidth: 420,
                width: "100%",
                padding: 24,
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Edit2 size={16} style={{ color: "var(--primary)" }} /> Edit Slot
                </h3>
                <button
                  type="button"
                  onClick={() => setEditSlotModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveSlotEdit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Start Time
                    </label>
                    <input
                      type="time"
                      required
                      value={editForm.start_time}
                      onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      End Time
                    </label>
                    <input
                      type="time"
                      required
                      value={editForm.end_time}
                      onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                      style={inputBaseStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Max Capacity
                  </label>
                  <input
                    type="number"
                    min={editingSlot.booked_count || 1}
                    value={editForm.max_capacity}
                    onChange={(e) => setEditForm({ ...editForm, max_capacity: e.target.value })}
                    style={inputBaseStyle}
                  />
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                    Currently booked: {editingSlot.booked_count}
                  </p>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Staff Member
                  </label>
                  <select
                    value={editForm.staff_id}
                    onChange={(e) => setEditForm({ ...editForm, staff_id: e.target.value })}
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

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    paddingTop: 16,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditSlotModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-secondary)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
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
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                maxWidth: 480,
                width: "100%",
                padding: 24,
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Briefcase size={18} style={{ color: "var(--primary)" }} />
                  {editingService ? "Edit Service" : "Add Bookable Service"}
                </h3>
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveService} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Service Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. General Consultation, Dental Checkup"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                    style={inputBaseStyle}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Description (optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief explanation of what this service covers..."
                    value={serviceForm.description}
                    onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                    style={{ ...inputBaseStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Duration *
                    </label>
                    <select
                      value={serviceForm.duration_minutes}
                      onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })}
                      style={{ ...selectBaseStyle, width: "100%" }}
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
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Price / Fee
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={serviceForm.price}
                        onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                        style={{ ...inputBaseStyle, flex: 1 }}
                      />
                      <select
                        value={serviceForm.currency}
                        onChange={(e) => setServiceForm({ ...serviceForm, currency: e.target.value })}
                        style={{ ...selectBaseStyle, width: 80 }}
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="BDT">BDT</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Badge Color
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="color"
                        value={serviceForm.color}
                        onChange={(e) => setServiceForm({ ...serviceForm, color: e.target.value })}
                        style={{
                          height: 34,
                          width: 44,
                          padding: 0,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                          background: "var(--bg-surface)",
                        }}
                      />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                        {serviceForm.color}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Status
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 6 }}>
                      <input
                        type="checkbox"
                        checked={serviceForm.is_active === 1}
                        onChange={(e) => setServiceForm({ ...serviceForm, is_active: e.target.checked ? 1 : 0 })}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>Active Service</span>
                    </label>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    paddingTop: 16,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setServiceModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-secondary)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
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
                    {editingService ? "Update Service" : "Create Service"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* ════════════════════════════════════════════════════════════════════
            MODAL 4: ADD/EDIT CAMPAIGN
            ════════════════════════════════════════════════════════════════════ */}
        {campaignModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                maxWidth: 520,
                width: "100%",
                padding: 24,
                boxShadow: "var(--shadow-lg)",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Workflow size={18} style={{ color: "var(--primary)" }} />
                  {editingCampaign ? "Edit Booking Campaign" : "New Booking Campaign"}
                </h3>
                <button
                  type="button"
                  onClick={() => setCampaignModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveCampaign} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={campaignForm.name}
                    onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                    placeholder="e.g. Website Demo Booking, VIP Consultation"
                    style={inputBaseStyle}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={campaignForm.description}
                    onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                    placeholder="Brief internal note for this campaign"
                    style={inputBaseStyle}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Welcome Greeting Message
                  </label>
                  <textarea
                    rows={2}
                    value={campaignForm.greeting_message}
                    onChange={(e) => setCampaignForm({ ...campaignForm, greeting_message: e.target.value })}
                    placeholder="e.g. 👋 Welcome! Please select a service to book your appointment:"
                    style={{ ...inputBaseStyle, height: "auto", resize: "vertical" }}
                  />
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                    Sent automatically to the customer when they reach this appointment node in the flow.
                  </span>
                </div>

                {/* Filter Services */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Included Services
                    </label>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {campaignForm.service_ids.length === 0 ? "All Services Included" : `${campaignForm.service_ids.length} selected`}
                    </span>
                  </div>

                  <div
                    style={{
                      maxHeight: 140,
                      overflowY: "auto",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      background: "var(--bg-hover)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {services.length === 0 ? (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                        No services defined yet. Default consultation will be used.
                      </span>
                    ) : (
                      services.map((svc) => {
                        const isChecked = campaignForm.service_ids.includes(svc.id);
                        return (
                          <label
                            key={svc.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: "0.78rem",
                              color: "var(--text-primary)",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCampaignForm({
                                    ...campaignForm,
                                    service_ids: [...campaignForm.service_ids, svc.id],
                                  });
                                } else {
                                  setCampaignForm({
                                    ...campaignForm,
                                    service_ids: campaignForm.service_ids.filter((id) => id !== svc.id),
                                  });
                                }
                              }}
                            />
                            <span>{svc.name}</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              ({svc.duration_minutes}m · {svc.price > 0 ? `${svc.currency} ${svc.price}` : "Free"})
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                    Leave all unchecked to offer all active services to the client.
                  </span>
                </div>

                {/* Optional Staff Assignment */}
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Assign to Specific Staff (Optional)
                  </label>
                  <select
                    value={campaignForm.staff_id}
                    onChange={(e) => setCampaignForm({ ...campaignForm, staff_id: e.target.value })}
                    style={selectBaseStyle}
                  >
                    <option value="">Any available staff / Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Active Checkbox */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    id="camp_active"
                    checked={campaignForm.is_active === 1}
                    onChange={(e) => setCampaignForm({ ...campaignForm, is_active: e.target.checked ? 1 : 0 })}
                  />
                  <label htmlFor="camp_active" style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    Campaign is Active
                  </label>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setCampaignModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-secondary)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
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
                    {editingCampaign ? "Update Campaign" : "Create Campaign"}
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
