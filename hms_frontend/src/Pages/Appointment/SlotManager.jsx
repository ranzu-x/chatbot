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
    max_patients: 1,
    slot_type: 'regular',
    walk_in_capacity: 5
  });
  const [createdSlots, setCreatedSlots] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/v1/doctors", {
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
        max_patients: 1,
        slot_type: 'regular',
        walk_in_capacity: 5
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Manage Doctor Slots</h2>
          <p className="text-gray-600 mb-6">Create time slots for scheduled appointments and walk-in hours</p>

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

            {/* Slot Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Slot Type</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSlotData({...slotData, slot_type: 'regular'})}
                  className={`p-4 border-2 rounded-lg text-center transition-all ${
                    slotData.slot_type === 'regular' 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-gray-300 bg-gray-50 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <div className="font-semibold">Regular Slots</div>
                  <div className="text-sm mt-1">For scheduled appointments</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSlotData({...slotData, slot_type: 'walk_in'})}
                  className={`p-4 border-2 rounded-lg text-center transition-all ${
                    slotData.slot_type === 'walk_in' 
                      ? 'border-orange-500 bg-orange-50 text-orange-700' 
                      : 'border-gray-300 bg-gray-50 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <div className="font-semibold">Walk-in Slots</div>
                  <div className="text-sm mt-1">For same-day walk-ins</div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={slotData.slot_date}
                  onChange={(e) => setSlotData({...slotData, slot_date: e.target.value})}
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
                  onChange={(e) => setSlotData({...slotData, slot_duration: parseInt(e.target.value)})}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={15}>15 minutes</option>
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
                  onChange={(e) => setSlotData({...slotData, start_time: e.target.value})}
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
                  onChange={(e) => setSlotData({...slotData, end_time: e.target.value})}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Max Patients */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {slotData.slot_type === 'regular' ? 'Max Patients per Slot' : 'Max Scheduled Patients'}
                </label>
                <input
                  type="number"
                  value={slotData.max_patients}
                  onChange={(e) => setSlotData({...slotData, max_patients: parseInt(e.target.value)})}
                  min="1"
                  max="10"
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Walk-in Capacity (only for walk-in slots) */}
              {slotData.slot_type === 'walk_in' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Walk-in Capacity</label>
                  <input
                    type="number"
                    value={slotData.walk_in_capacity}
                    onChange={(e) => setSlotData({...slotData, walk_in_capacity: parseInt(e.target.value)})}
                    min="1"
                    max="20"
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {/* Summary */}
            {selectedDoctor && slotData.slot_date && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h4 className="font-semibold text-gray-700 mb-2">Slot Summary</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>• Doctor: <span className="font-medium">{getSelectedDoctorName()}</span></div>
                  <div>• Date: <span className="font-medium">{slotData.slot_date}</span></div>
                  <div>• Time: <span className="font-medium">{slotData.start_time} - {slotData.end_time}</span></div>
                  <div>• Duration: <span className="font-medium">{slotData.slot_duration} minutes</span></div>
                  <div>• Type: <span className="font-medium capitalize">{slotData.slot_type.replace('_', ' ')} slots</span></div>
                  {slotData.slot_type === 'regular' ? (
                    <div>• Capacity: <span className="font-medium">{slotData.max_patients} patient(s) per slot</span></div>
                  ) : (
                    <div>• Capacity: <span className="font-medium">{slotData.walk_in_capacity} walk-in patient(s)</span></div>
                  )}
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
                `Create ${slotData.slot_type === 'regular' ? 'Regular' : 'Walk-in'} Slots`
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SlotManager;