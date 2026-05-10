// src/pages/Appointments/AppointmentForm.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams, useNavigate } from "react-router";
import { toast } from "react-hot-toast";

const AppointmentForm = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientIdFromUrl = searchParams.get("patientId");

  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState("");
  const [serviceFee, setServiceFee] = useState(0);
  const [loadingFee, setLoadingFee] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [appointmentType, setAppointmentType] = useState("scheduled"); // "scheduled" or "walk_in"

  const [formData, setFormData] = useState({
    doctor_id: "",
    patient_id: patientIdFromUrl || "",
    slot_id: "",
    appointment_date: "",
    reason: "",
    // service_id: "",
    appointment_fee: 0,
  });

  const [step, setStep] = useState(1); // 1: Select Doctor, 2: Select Slot, 3: Confirm

  useEffect(() => {
    fetchDoctors();
    if (patientIdFromUrl) {
      fetchSinglePatient(patientIdFromUrl);
    }
  }, [patientIdFromUrl]);

  useEffect(() => {
    if (formData.doctor_id) {
      fetchDoctorServices(formData.doctor_id);
    } else {
      setServices([]);
      setSelectedService("");
      setServiceFee(0);
    }
  }, [formData.doctor_id]);

  // Fetch available slots when doctor and date are selected
  useEffect(() => {
    if (formData.doctor_id && formData.appointment_date && appointmentType === "scheduled") {
      fetchAvailableSlots(formData.doctor_id, formData.appointment_date);
    } else {
      setAvailableSlots([]);
      setFormData(prev => ({ ...prev, slot_id: "" }));
    }
  }, [formData.doctor_id, formData.appointment_date, appointmentType]);

  // Debounced patient search
  useEffect(() => {
    if (!patientIdFromUrl && patientSearch.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchPatients(patientSearch);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else if (patientSearch.length === 0) {
      setPatients([]);
    }
  }, [patientSearch, patientIdFromUrl]);


  useEffect(() => {
    if (formData.doctor_id && selectedService) {
      fetchDoctorFee(formData.doctor_id, selectedService);
    }
  }, [selectedService, formData.doctor_id]);


  const fetchDoctorServices = async (doctorId) => {
    try {
      const res = await axios.get(
        `/api/v1/doctor-services?doctor_id=${doctorId}`,
        { withCredentials: true }
      );
      setServices(res.data || []);
    } catch (error) {
      console.error("Error fetching services:", error);
      toast.error("Failed to load doctor services");
    }
  };

  const fetchDoctorFee = async (doctorId, serviceId) => {
    setLoadingFee(true);
    try {
      const res = await axios.get(
        `/api/v1/doctor-fees?doctor_id=${doctorId}&service_id=${serviceId}`,
        { withCredentials: true }
      );

      const fee = res.data?.fee || 0;

      setServiceFee(fee);
      setFormData(prev => ({
        ...prev,
        appointment_fee: fee,
        service_id: serviceId
      }));
    } catch (error) {
      console.error("Error fetching fee:", error);
      toast.error("Failed to load service fee");
      setServiceFee(0);
    } finally {
      setLoadingFee(false);
    }
  };



  const fetchDoctors = async () => {
    try {
      const res = await axios.get("/api/v1/doctors", {
        withCredentials: true,
      });
      setDoctors(res.data);
    } catch (error) {
      console.log("Error fetching doctors:", error);
      toast.error(error.response?.data?.message || "Failed to fetch doctors");
    }
  };

  const fetchSinglePatient = async (id) => {
    try {
      const res = await axios.get(`/api/v1/patients/${id}`, {
        withCredentials: true,
      });
      console.log(res.data);

      setSelectedPatient(res.data);
      setFormData(prev => ({ ...prev, patient_id: id }));
    } catch (error) {
      console.error("Error fetching patient:", error);
      toast.error("Failed to load patient details");
    }
  };

  const fetchAvailableSlots = async (doctorId, date) => {
    setLoadingSlots(true);
    try {
      const res = await axios.get(
        `/api/v1/appointments/available-slots?doctor_id=${doctorId}&date=${date}`,
        { withCredentials: true }
      );

      // Handle different response formats
      const slots = res.data.slots || res.data || [];
      setAvailableSlots(slots);

      console.log("Available slots response:", res.data); // Debug log

      // If no slots available, suggest walk-in
      if (slots.length === 0) {
        toast.error(
          <div>
            <div className="font-semibold">No slots available</div>
            <div className="text-sm">Would you like to register as a walk-in instead?</div>
          </div>,
          { duration: 4000 }
        );
      }
    } catch (error) {
      console.error("Error fetching slots:", error);
      toast.error("Failed to load available slots");
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const searchPatients = async (query) => {
    setIsSearching(true);
    try {
      const res = await axios.get(
        `/api/v1/patients/search?q=${encodeURIComponent(query)}`,
        { withCredentials: true }
      );
      setPatients(res.data);
    } catch (error) {
      console.error("Error searching patients:", error);
      toast.error(error.response?.data?.message || "Failed to search patients");
    } finally {
      setIsSearching(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePatientSelect = (patient) => {
    setSelectedPatient(patient);
    setFormData(prev => ({ ...prev, patient_id: patient.id }));
    setPatientSearch("");
    setPatients([]);
  };

  const handleSlotSelect = (slot) => {
    setFormData(prev => ({
      ...prev,
      slot_id: slot.id,
      appointment_time: slot.start_time
    }));
    setStep(3);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.patient_id) {
      toast.error("Please select a patient");
      return;
    }

    if (appointmentType === "scheduled" && !formData.slot_id) {
      toast.error("Please select a time slot");
      return;
    }

    if (appointmentType === "walk_in" && !formData.doctor_id) {
      toast.error("Please select a doctor");
      return;
    }

    try {
      const endpoint = appointmentType === "walk_in"
        ? "/api/v1/appointments/walk-in"
        : "/api/v1/appointments";

      const response = await axios.post(endpoint, formData, {
        withCredentials: true,
      });

      const result = response.data;

      if (appointmentType === "walk_in") {
        toast.success(
          <div>
            <div className="font-semibold">Walk-in appointment created!</div>
            <div className="text-sm">
              Reference: <strong>{result.walkin_reference}</strong><br />
              Queue Position: <strong>#{result.walk_in_sequence}</strong><br />
              Estimated Wait: <strong>{result.estimated_wait_time} minutes</strong>
            </div>
          </div>,
          { duration: 5000 }
        );
      } else {
        toast.success("Appointment created successfully!");
      }

      // Reset form
      setFormData({
        doctor_id: "",
        patient_id: patientIdFromUrl || "",
        slot_id: "",
        appointment_date: "",
        reason: "",
      });
      setSelectedPatient(patientIdFromUrl ? selectedPatient : null);
      setStep(1);
      setAvailableSlots([]);
      setAppointmentType("scheduled");

      navigate("/appointments");
    } catch (error) {
      console.error("Error:", error);
      const errorMessage = error.response?.data?.message || error.message || "Failed to create appointment";
      toast.error(errorMessage);
    }
  };

  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getSelectedDoctor = () => {
    return doctors.find(d => d.id == formData.doctor_id);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          {/* Appointment Type Selector */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Book Appointment</h2>
            <div className="flex gap-4 justify-center mb-4">
              <button
                type="button"
                onClick={() => {
                  setAppointmentType("scheduled");
                  setStep(1);
                  setFormData(prev => ({ ...prev, slot_id: "" }));
                }}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${appointmentType === "scheduled"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                📅 Scheduled Appointment
              </button>
              <button
                type="button"
                onClick={() => {
                  setAppointmentType("walk_in");
                  setStep(1);
                  setFormData(prev => ({ ...prev, slot_id: "", appointment_date: "" }));
                }}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${appointmentType === "walk_in"
                  ? "bg-orange-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                🚶 Walk-in Appointment
              </button>
            </div>
            <p className="text-gray-600 text-sm">
              {appointmentType === "scheduled"
                ? "Book a scheduled appointment with your preferred doctor"
                : "Quick registration for same-day appointments"}
            </p>
          </div>

          {/* Progress Steps - Only for Scheduled */}
          {appointmentType === "scheduled" && (
            <div className="flex mb-8 bg-gray-100 rounded-lg p-1">
              <div className={`flex-1 text-center py-3 rounded-lg transition-all ${step >= 1 ? 'bg-white shadow border border-blue-200 text-blue-700 font-semibold' : 'text-gray-500'
                }`}>
                Step 1: Select Doctor & Date
              </div>
              <div className={`flex-1 text-center py-3 rounded-lg transition-all ${step >= 2 ? 'bg-white shadow border border-blue-200 text-blue-700 font-semibold' : 'text-gray-500'
                }`}>
                Step 2: Choose Time Slot
              </div>
              <div className={`flex-1 text-center py-3 rounded-lg transition-all ${step >= 3 ? 'bg-white shadow border border-blue-200 text-blue-700 font-semibold' : 'text-gray-500'
                }`}>
                Step 3: Confirm
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Patient, Doctor, and Date Selection */}
            {step === 1 && (
              <>
                {/* Patient Selection */}
                <div className={`${appointmentType === "walk_in" ? "bg-orange-50 border-orange-200" : "bg-gray-50"} p-4 rounded-lg`}>
                  <label className={`block text-sm font-semibold mb-3 ${appointmentType === "walk_in" ? "text-orange-800" : "text-gray-700"}`}>
                    Patient Information
                  </label>
                  {patientIdFromUrl ? (
                    <div className="w-full border-2 border-green-200 bg-green-50 p-4 rounded-lg">
                      {selectedPatient ? (
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
                          <div className="text-sm text-green-600 font-medium">
                            ✓ Selected
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-500">Loading patient...</div>
                      )}
                    </div>
                  ) : (
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
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPatient(null);
                                setFormData(prev => ({ ...prev, patient_id: "" }));
                              }}
                              className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 border border-red-200 rounded hover:bg-red-50 transition-colors"
                            >
                              Change Patient
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
                            className={`w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:border-transparent ${appointmentType === "walk_in" ? "focus:ring-orange-500" : "focus:ring-blue-500"
                              }`}
                          />

                          {isSearching && (
                            <div className="absolute w-full mt-2 p-4 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                              <div className="flex items-center text-gray-500">
                                <div className={`animate-spin rounded-full h-4 w-4 border-b-2 mr-3 ${appointmentType === "walk_in" ? "border-orange-600" : "border-blue-600"
                                  }`}></div>
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
                                  className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${appointmentType === "walk_in" ? "hover:bg-orange-50" : "hover:bg-blue-50"
                                    }`}
                                >
                                  <div className={`font-semibold ${appointmentType === "walk_in" ? "text-orange-700" : "text-blue-700"}`}>
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

                          {patientSearch.length >= 2 && patients.length === 0 && !isSearching && (
                            <div className="absolute w-full mt-2 p-4 bg-white border border-gray-300 rounded-lg shadow-lg text-gray-500 z-10">
                              No patients found for "{patientSearch}"
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Doctor Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Doctor {appointmentType === "walk_in" && "for Walk-in"}
                  </label>
                  <select
                    name="doctor_id"
                    value={formData.doctor_id}
                    onChange={handleChange}
                    className={`w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:border-transparent ${appointmentType === "walk_in" ? "focus:ring-orange-500" : "focus:ring-blue-500"
                      }`}
                    required
                  >
                    <option value="">Choose a doctor...</option>
                    {doctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        Dr. {doc.first_name} {doc.last_name}
                        {doc.specialization && ` - ${doc.specialization}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Doctor Service Selection */}
                {services.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Select Service
                    </label>

                    <select
                      value={selectedService}
                      onChange={(e) => setSelectedService(e.target.value)}
                      className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Choose a service...</option>
                      {services.map(service => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}


                {selectedService && (
                  <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-800">
                        Service Fee
                      </span>
                      <span className="text-xl font-bold text-green-700">
                        {loadingFee ? "Loading..." : `৳ ${serviceFee}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Date Selection - Only for Scheduled */}
                {appointmentType === "scheduled" && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Appointment Date</label>
                    <input
                      type="date"
                      name="appointment_date"
                      value={formData.appointment_date}
                      onChange={handleChange}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => appointmentType === "scheduled" ? setStep(2) : setStep(3)}
                  disabled={!formData.doctor_id || !formData.patient_id || !selectedService || (appointmentType === "scheduled" && !formData.appointment_date)}
                  className={`w-full text-white p-3 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold ${appointmentType === "walk_in"
                    ? "bg-orange-600 hover:bg-orange-700"
                    : "bg-blue-600 hover:bg-blue-700"
                    }`}
                >
                  {appointmentType === "scheduled" ? "Next: Choose Time Slot" : "Next: Confirm Walk-in"}
                </button>
              </>
            )}

            {/* Step 2: Time Slot Selection - Only for Scheduled */}
            {step === 2 && appointmentType === "scheduled" && (
              <>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-2">Appointment Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Doctor:</span>
                      <div className="text-gray-800">{getSelectedDoctor()?.first_name} {getSelectedDoctor()?.last_name}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Date:</span>
                      <div className="text-gray-800">{formData.appointment_date}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Patient:</span>
                      <div className="text-gray-800">{selectedPatient?.first_name} {selectedPatient?.last_name}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Available Time Slots</label>

                  {loadingSlots ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-500">Loading available time slots...</p>
                    </div>
                  ) : availableSlots.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => handleSlotSelect(slot)}
                          className="p-4 border-2 border-green-200 bg-green-50 rounded-xl hover:border-green-500 hover:bg-green-100 hover:shadow-md transition-all text-center group"
                        >
                          <div className="font-bold text-green-800 text-lg mb-1">
                            {formatTime(slot.start_time)}
                          </div>
                          <div className="text-sm text-green-600 mb-2">
                            {slot.available_slots} slot{slot.available_slots !== 1 ? 's' : ''} available
                          </div>
                          <div className="text-xs text-gray-500 bg-white rounded-full px-2 py-1 inline-block">
                            {slot.slot_duration} minutes
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <div className="text-gray-400 mb-2">📅</div>
                      <p className="text-gray-500 font-medium">No available slots for selected date</p>
                      <p className="text-gray-400 text-sm mt-1">Please choose a different date or doctor</p>
                      <div className="flex gap-3 justify-center mt-4">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          ← Back to Date Selection
                        </button>
                        <span className="text-gray-400">or</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAppointmentType("walk_in");
                            setStep(3);
                          }}
                          className="text-orange-600 hover:text-orange-800 font-medium"
                        >
                          Register as Walk-in →
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 bg-gray-500 text-white p-3 rounded-lg hover:bg-gray-600 transition-colors font-medium"
                  >
                    ← Back
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && (
              <>
                <div className={`p-6 rounded-lg border ${appointmentType === "walk_in"
                  ? "bg-orange-50 border-orange-200"
                  : "bg-green-50 border-green-200"
                  }`}>
                  <h3 className={`font-bold text-lg mb-4 flex items-center ${appointmentType === "walk_in" ? "text-orange-800" : "text-green-800"
                    }`}>
                    <span className={`rounded-full p-1 mr-2 ${appointmentType === "walk_in" ? "bg-orange-200" : "bg-green-200"
                      }`}>✓</span>
                    {appointmentType === "walk_in" ? "Walk-in" : "Appointment"} Summary
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div>
                        <span className="font-semibold text-gray-600">Patient:</span>
                        <div className="text-gray-800">{selectedPatient?.first_name} {selectedPatient?.last_name}</div>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-600">Doctor:</span>
                        <div className="text-gray-800">Dr. {getSelectedDoctor()?.first_name} {getSelectedDoctor()?.last_name}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {appointmentType === "scheduled" ? (
                        <>
                          <div>
                            <span className="font-semibold text-gray-600">Date:</span>
                            <div className="text-gray-800">{formData.appointment_date}</div>
                          </div>
                          <div>
                            <span className="font-semibold text-gray-600">Time:</span>
                            <div className="text-gray-800 font-bold">{formatTime(formData.appointment_time)}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="font-semibold text-gray-600">Type:</span>
                            <div className="text-gray-800 font-bold">Walk-in (Same Day)</div>
                          </div>
                          <div>
                            <span className="font-semibold text-gray-600">Status:</span>
                            <div className="text-orange-600 font-bold">Queue Position Assigned After Booking</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Information Box for Walk-in */}
                {appointmentType === "walk_in" && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-800 mb-2">About Walk-in Appointments</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• First-come, first-served basis</li>
                      <li>• Estimated wait times provided upon registration</li>
                      <li>• You'll receive a queue number and walk-in reference</li>
                      <li>• Emergency cases will be prioritized</li>
                    </ul>
                  </div>
                )}

                {/* Reason */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Reason for {appointmentType === "walk_in" ? "Visit" : "Appointment"}
                    <span className="text-gray-400 font-normal ml-1">(Optional)</span>
                  </label>
                  <textarea
                    name="reason"
                    value={formData.reason}
                    onChange={handleChange}
                    className={`w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:border-transparent ${appointmentType === "walk_in" ? "focus:ring-orange-500" : "focus:ring-blue-500"
                      }`}
                    rows="3"
                    placeholder={appointmentType === "walk_in"
                      ? "Brief reason for walk-in visit..."
                      : "Brief reason for appointment (symptoms, follow-up, consultation, etc.)"}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => appointmentType === "scheduled" ? setStep(2) : setStep(1)}
                    className="flex-1 bg-gray-500 text-white p-3 rounded-lg hover:bg-gray-600 transition-colors font-medium"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 text-white p-3 rounded-lg transition-colors font-medium ${appointmentType === "walk_in"
                      ? "bg-orange-600 hover:bg-orange-700"
                      : "bg-green-600 hover:bg-green-700"
                      }`}
                  >
                    Confirm & Book {appointmentType === "walk_in" ? "Walk-in" : "Appointment"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default AppointmentForm;