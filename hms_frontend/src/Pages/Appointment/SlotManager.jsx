// src/components/Slots/SlotManager.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

const SlotManager = () => {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [slotData, setSlotData] = useState({
    slot_date: '',
    start_time: '09:00',
    end_time: '17:00',
    slot_duration: 30,
    max_patients: 1
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const res = await axios.get("/api/v1/doctors", {
        withCredentials: true,
      });
      setDoctors(res.data);
    } catch (error) {
      console.error("Error fetching doctors:", error);
      toast.error("Failed to fetch doctors");
    }
  };

  const handleCreateSlots = async (e) => {
    e.preventDefault();

    if (!selectedDoctor) {
      toast.error("Please select a doctor");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post("http://localhost:5000/api/v1/slots", {
        doctor_id: selectedDoctor,
        ...slotData
      }, { withCredentials: true });

      toast.success(res.data.message);
      setSlotData({
        slot_date: '',
        start_time: '09:00',
        end_time: '17:00',
        slot_duration: 30,
        max_patients: 1
      });
      setSelectedDoctor('');

    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to create slots");
    } finally {
      setLoading(false);
    }
  };

  const getSelectedDoctorName = () => {
    const doctor = doctors.find(d => d.id == selectedDoctor);
    return doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : '';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Manage Doctor Appointment Slots</h2>
          <p className="text-gray-600 mb-6">Create time slots for scheduled appointments only</p>

          <form onSubmit={handleCreateSlots} className="space-y-6">
            {/* Doctor Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Doctor</label>
              <select
                value={selectedDoctor}
                onChange={(e) => setSelectedDoctor(e.target.value)}
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select Doctor</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    Dr. {doc.first_name} {doc.last_name}
                    {doc.specialization && ` - ${doc.specialization}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={slotData.slot_date}
                  onChange={(e) => setSlotData({ ...slotData, slot_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Slot Duration */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Slot Duration</label>
                <select
                  value={slotData.slot_duration}
                  onChange={(e) => setSlotData({ ...slotData, slot_duration: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Start Time */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Start Time</label>
                <input
                  type="time"
                  value={slotData.start_time}
                  onChange={(e) => setSlotData({ ...slotData, start_time: e.target.value })}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* End Time */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">End Time</label>
                <input
                  type="time"
                  value={slotData.end_time}
                  onChange={(e) => setSlotData({ ...slotData, end_time: e.target.value })}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Break Times */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Break Start (optional)
              </label>
              <input
                type="time"
                onChange={(e) => setSlotData({ ...slotData, break_start: e.target.value })}
                className="w-full border p-3 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Break End (optional)
              </label>
              <input
                type="time"
                onChange={(e) => setSlotData({ ...slotData, break_end: e.target.value })}
                className="w-full border p-3 rounded-lg"
              />
            </div>
            </div>


            {/* Max Patients */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Max Patients per Slot
              </label>
              <input
                type="number"
                value={slotData.max_patients}
                onChange={(e) => setSlotData({ ...slotData, max_patients: parseInt(e.target.value) })}
                min="1"
                max="10"
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">Number of patients that can book this same time slot</p>
            </div>

            {/* Summary */}
            {selectedDoctor && slotData.slot_date && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-700 mb-2">Slot Summary</h4>
                <div className="text-sm text-blue-600 space-y-1">
                  <div>• Doctor: <span className="font-medium">{getSelectedDoctorName()}</span></div>
                  <div>• Date: <span className="font-medium">{slotData.slot_date}</span></div>
                  <div>• Time Range: <span className="font-medium">{slotData.start_time} - {slotData.end_time}</span></div>
                  <div>• Duration: <span className="font-medium">{slotData.slot_duration} minutes per appointment</span></div>
                  <div>• Total Capacity: <span className="font-medium">{slotData.max_patients} patient(s) for the day</span></div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !selectedDoctor || !slotData.slot_date}
              className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating Slots...
                </div>
              ) : (
                'Create Appointment Slots'
              )}
            </button>
          </form>

          {/* Walk-in Information Box */}
          <div className="mt-8 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="bg-orange-100 p-2 rounded-lg mr-3">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-orange-800">Walk-in Patients</h3>
                <p className="text-orange-700 text-sm mt-1">
                  Walk-in patients are handled separately through the walk-in registration system.
                  They don't require pre-defined slots and will be assigned to available doctors based on real-time availability.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlotManager;