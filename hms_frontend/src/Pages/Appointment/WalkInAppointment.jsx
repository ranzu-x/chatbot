// src/pages/Appointments/WalkInAppointment.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router";
import { toast } from "react-hot-toast";

const WalkInAppointment = () => {
  const navigate = useNavigate();

  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [walkInSlots, setWalkInSlots] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    doctor_id: "",
    patient_id: "",
    reason: "",
  });

  useEffect(() => {
    fetchDoctors();
  }, []);

  // Fetch walk-in slots when doctor is selected
  useEffect(() => {
    if (selectedDoctor) {
      fetchWalkInSlots(selectedDoctor);
      setFormData(prev => ({ ...prev, doctor_id: selectedDoctor }));
    } else {
      setWalkInSlots([]);
    }
  }, [selectedDoctor]);

  // Debounced patient search
  useEffect(() => {
    if (patientSearch.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchPatients(patientSearch);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else if (patientSearch.length === 0) {
      setPatients([]);
    }
  }, [patientSearch]);

  const fetchDoctors = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/v1/doctors", {
        withCredentials: true,
      });
      setDoctors(res.data);
    } catch (error) {
      console.log("Error fetching doctors:", error);
      toast.error("Failed to fetch doctors");
    }
  };

  const fetchWalkInSlots = async (doctorId) => {
    try {
      const res = await axios.get(
        `http://localhost:5000/api/v1/slots/walk-in?doctor_id=${doctorId}`,
        { withCredentials: true }
      );
      setWalkInSlots(res.data);
    } catch (error) {
      console.error("Error fetching walk-in slots:", error);
      setWalkInSlots([]);
    }
  };

  const searchPatients = async (query) => {
    setIsSearching(true);
    try {
      const res = await axios.get(
        `http://localhost:5000/api/v1/patients/search?q=${encodeURIComponent(query)}`,
        { withCredentials: true }
      );
      setPatients(res.data);
    } catch (error) {
      console.error("Error searching patients:", error);
      toast.error("Failed to search patients");
    } finally {
      setIsSearching(false);
    }
  };

  const handlePatientSelect = (patient) => {
    setSelectedPatient(patient);
    setFormData(prev => ({ ...prev, patient_id: patient.id }));
    setPatientSearch("");
    setPatients([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.patient_id || !formData.doctor_id) {
      toast.error("Please select a patient and doctor");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        "http://localhost:5000/api/v1/appointments/walk-in",
        formData,
        { withCredentials: true }
      );

      const result = response.data;
      
      toast.success(
        <div>
          <div className="font-semibold">Walk-in appointment created!</div>
          <div className="text-sm">
            Queue Position: <strong>#{result.walk_in_sequence}</strong> • 
            Estimated Wait: <strong>{result.estimated_wait_time} minutes</strong>
          </div>
        </div>
      );

      // Reset form
      setFormData({
        doctor_id: "",
        patient_id: "",
        reason: "",
      });
      setSelectedPatient(null);
      setSelectedDoctor("");
      setPatientSearch("");
      setWalkInSlots([]);

    } catch (error) {
      console.error("Error creating walk-in appointment:", error);
      toast.error(error.response?.data?.error || "Failed to create walk-in appointment");
    } finally {
      setLoading(false);
    }
  };

  const getSelectedDoctor = () => {
    return doctors.find(d => d.id == selectedDoctor);
  };

  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Walk-in Appointment</h2>
            <p className="text-gray-600">Quick registration for same-day appointments</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Patient Selection */}
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <label className="block text-sm font-semibold text-orange-800 mb-3">
                Patient Information
              </label>
              <div className="relative">
                {selectedPatient ? (
                  <div className="w-full border-2 border-green-200 bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-green-800">
                          #{selectedPatient.patient_code || selectedPatient.id}
                        </div>
                        <div className="text-gray-800">
                          {selectedPatient.first_name} {selectedPatient.last_name}
                        </div>
                        {selectedPatient.phone && (
                          <div className="text-sm text-gray-600 mt-1">
                            📞 {selectedPatient.phone}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatient(null);
                          setFormData(prev => ({ ...prev, patient_id: "" }));
                        }}
                        className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 border border-red-200 rounded hover:bg-red-50 transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search patient by name, phone, or patient ID..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    
                    {isSearching && (
                      <div className="absolute w-full mt-2 p-4 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                        <div className="flex items-center text-gray-500">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600 mr-3"></div>
                          Searching patients...
                        </div>
                      </div>
                    )}
                    
                    {patients.length > 0 && (
                      <div className="absolute w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto z-10">
                        {patients.map((patient) => (
                          <div
                            key={patient.id}
                            onClick={() => handlePatientSelect(patient)}
                            className="p-3 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                          >
                            <div className="font-semibold text-orange-700">
                              #{patient.patient_code || patient.id}
                            </div>
                            <div className="text-gray-800 font-medium">
                              {patient.first_name} {patient.last_name}
                            </div>
                            {patient.phone && (
                              <div className="text-gray-600 text-sm mt-1">
                                📞 {patient.phone}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Doctor Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Doctor for Walk-in
              </label>
              <select
                value={selectedDoctor}
                onChange={(e) => setSelectedDoctor(e.target.value)}
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                required
              >
                <option value="">Choose a doctor for walk-in...</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    Dr. {doc.first_name} {doc.last_name} 
                    {doc.specialization && ` - ${doc.specialization}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Walk-in Slot Information */}
            {selectedDoctor && walkInSlots.length > 0 && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-800 mb-3">Walk-in Availability</h3>
                <div className="space-y-3">
                  {walkInSlots.map((slot) => (
                    <div key={slot.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <div className="font-medium text-gray-800">
                          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                        </div>
                        <div className="text-sm text-gray-600">
                          {slot.available_walk_ins} walk-in spot{slot.available_walk_ins !== 1 ? 's' : ''} available
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-green-600">
                          Available
                        </div>
                        <div className="text-xs text-gray-500">
                          Dr. {slot.doctor_name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedDoctor && walkInSlots.length === 0 && (
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div className="text-center">
                  <div className="text-yellow-600 mb-2">⚠️</div>
                  <p className="text-yellow-800 font-medium">No walk-in slots available</p>
                  <p className="text-yellow-600 text-sm">Please select a different doctor or try scheduled appointment</p>
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reason for Visit
                <span className="text-gray-400 font-normal ml-1">(Optional)</span>
              </label>
              <textarea
                name="reason"
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                rows="3"
                placeholder="Brief reason for walk-in visit..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate("/appointments")}
                className="flex-1 bg-gray-500 text-white p-3 rounded-lg hover:bg-gray-600 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.patient_id || !formData.doctor_id || walkInSlots.length === 0}
                className="flex-1 bg-orange-600 text-white p-3 rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </div>
                ) : (
                  "Create Walk-in Appointment"
                )}
              </button>
            </div>
          </form>

          {/* Information Box */}
          <div className="mt-6 bg-gray-50 p-4 rounded-lg border">
            <h4 className="font-semibold text-gray-700 mb-2">About Walk-in Appointments</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• First-come, first-served basis</li>
              <li>• Estimated wait times provided upon registration</li>
              <li>• Walk-in hours may vary by doctor</li>
              <li>• Emergency cases will be prioritized</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalkInAppointment;