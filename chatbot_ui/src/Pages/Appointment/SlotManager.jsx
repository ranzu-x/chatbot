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
} from "lucide-react";
import { fetchSlots, createSlots, deleteSlot, toggleSlot } from "../../services/appointmentService";
import api from "../../services/api";

export default function SlotManager() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [teamMembers, setTeamMembers] = useState([]);

  // Generate slots modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [genForm, setGenForm] = useState({
    slot_date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "17:00",
    slot_duration: 30,
    max_capacity: 1,
    staff_id: "",
    break_start: "13:00",
    break_end: "14:00",
  });

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedDate) params.date = selectedDate;
      if (selectedStaff) params.staffId = selectedStaff;
      const res = await fetchSlots(params);
      setSlots(res.slots || []);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to load slots");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedStaff]);

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
    loadTeam();
  }, [loadSlots]);

  const handleGenerateSlots = async (e) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      const payload = {
        ...genForm,
        staffId: genForm.staff_id || null,
        slot_duration: parseInt(genForm.slot_duration) || 30,
        max_capacity: parseInt(genForm.max_capacity) || 1,
      };
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
                Calendar Availability & Slot Generator
              </h1>
            </div>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Configure available booking windows for automated WhatsApp and channel scheduling.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus size={15} /> Generate Daily Slots
            </button>
            <button
              onClick={loadSlots}
              title="Refresh"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm transition"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
              <Calendar size={14} /> Filter Date:
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
              <User size={14} /> Staff Member:
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
          </div>
        </div>

        {/* Slots Grid */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Clock size={16} className="text-indigo-600" /> Available Time Windows ({slots.length})
            </h3>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mb-2"></div>
              <p className="text-xs">Loading slots...</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Clock size={36} className="mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-xs text-slate-600">No time slots created for this date</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Click "Generate Daily Slots" to create time intervals for appointments.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {slots.map((s) => {
                const isFull = s.booked_count >= s.max_capacity;
                return (
                  <div
                    key={s.id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      !s.is_active
                        ? "bg-slate-50 border-slate-200 opacity-60"
                        : isFull
                        ? "bg-amber-50/40 border-amber-200"
                        : "bg-white border-slate-200/80 hover:border-indigo-300 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-extrabold text-sm text-slate-900">
                        {s.start_time?.substring(0, 5)} - {s.end_time?.substring(0, 5)}
                      </span>
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

                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
                      <span>
                        Capacity:{" "}
                        <b className={isFull ? "text-amber-600" : "text-emerald-600"}>
                          {s.booked_count}/{s.max_capacity}
                        </b>
                      </span>
                      <button
                        onClick={() => handleDeleteSlot(s.id)}
                        title="Delete slot"
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {s.staff_name && (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">
                        Staff: {s.staff_name}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal: Generate Daily Slots */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
              <h3 className="font-extrabold text-slate-800 text-base mb-3 flex items-center gap-2">
                <Clock className="text-indigo-600" size={18} /> Generate Daily Slots
              </h3>

              <form onSubmit={handleGenerateSlots} className="space-y-3 text-xs">
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
                    <label className="font-bold text-slate-700 block mb-1">Slot Duration (mins)</label>
                    <select
                      value={genForm.slot_duration}
                      onChange={(e) => setGenForm({ ...genForm, slot_duration: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                    >
                      <option value="15">15 mins</option>
                      <option value="30">30 mins</option>
                      <option value="45">45 mins</option>
                      <option value="60">60 mins</option>
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
                  <label className="font-bold text-slate-700 block mb-1">Staff Member (optional)</label>
                  <select
                    value={genForm.staff_id}
                    onChange={(e) => setGenForm({ ...genForm, staff_id: e.target.value })}
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
      </div>
    </AppLayout>
  );
}
