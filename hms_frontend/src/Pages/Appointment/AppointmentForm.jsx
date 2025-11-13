import React, { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router";

const AppointmentForm = () => {
  const [searchParams] = useSearchParams();
  const patientIdFromUrl = searchParams.get("patientId");

  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState(""); // ✅ Search input
  const [isSearching, setIsSearching] = useState(false);
  
  const [formData, setFormData] = useState({
    doctor_id: "",
    patient_id: patientIdFromUrl || "",
    appointment_date: "",
    appointment_time: "",
    reason: "",
  });

  useEffect(() => {
    fetchDoctors();
    
    if (patientIdFromUrl) {
      fetchSinglePatient(patientIdFromUrl);
    }
    // Don't fetch all patients on load anymore
  }, [patientIdFromUrl]);

  // ✅ Debounced search - only search after user stops typing
  useEffect(() => {
    if (!patientIdFromUrl && patientSearch.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchPatients(patientSearch);
      }, 500); // Wait 500ms after user stops typing

      return () => clearTimeout(timeoutId);
    } else if (patientSearch.length === 0) {
      setPatients([]); // Clear results when search is empty
    }
  }, [patientSearch, patientIdFromUrl]);

  const fetchDoctors = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/v1/doctors", {
        withCredentials: true,
      });
      setDoctors(res.data);
    } catch (error) {
      console.log("Error fetching doctors:", error);
      alert(error.response?.data?.message || "Failed to fetch doctors");
    }
  };

  const fetchSinglePatient = async (id) => {
    try {
      const res = await axios.get(`http://localhost:5000/api/v1/patients/${id}`, {
        withCredentials: true,
      });
      setSelectedPatient(res.data);
      setFormData(prev => ({ ...prev, patient_id: id }));
    } catch (error) {
      console.error("Error fetching patient:", error);
      alert("Failed to load patient details");
    }
  };

  // ✅ Search patients by name or patient number
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
      alert(error.response?.data?.message || "Failed to search patients");
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
    setPatientSearch(""); // Clear search after selection
    setPatients([]); // Clear dropdown
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.patient_id) {
      alert("Please select a patient");
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/v1/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create appointment");
      }

      await response.json();
      alert("Appointment created successfully!");

      setFormData({
        doctor_id: "",
        patient_id: patientIdFromUrl || "",
        appointment_date: "",
        appointment_time: "",
        reason: "",
      });
      setSelectedPatient(patientIdFromUrl ? selectedPatient : null);
      navigation.navigate("/appointments");
    } catch (error) {
      console.error("Error:", error);
      alert(error.message || "Failed to create appointment");
    }
  };

  return (
    <div className="p-4">
      <div className="p-6 max-w-2xl mx-auto bg-white shadow-md rounded-2xl">
      <h2 className="text-xl font-semibold mb-4">Create New Appointment</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Doctor Selection */}
        <div>
          <label className="block mb-1 font-medium">Doctor</label>
          <select
            name="doctor_id"
            value={formData.doctor_id}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          >
            <option value="">Select Doctor</option>
            {doctors.map((doc) => (
              <option key={doc.id} value={doc.id}>
                Dr. {doc.first_name} {doc.last_name}
              </option>
            ))}
          </select>
        </div>

        {/* Patient Selection */}
        <div>
          <label className="block mb-1 font-medium">Patient</label>
          
          {patientIdFromUrl ? (
            // ✅ Read-only if coming from patient list
            <div className="w-full border p-2 rounded bg-gray-100 flex items-center justify-between">
              {selectedPatient ? (
                <div>
                  <span className="font-semibold">#{selectedPatient.patient_code || selectedPatient.id}</span>
                  {" - "}
                  <span>{selectedPatient.first_name} {selectedPatient.last_name}</span>
                </div>
              ) : (
                <span>Loading patient...</span>
              )}
            </div>
          ) : (
            // ✅ Searchable dropdown
            <div className="relative">
              {selectedPatient ? (
                // Show selected patient with option to change
                <div className="w-full border p-2 rounded bg-gray-50 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">#{selectedPatient.patient_code || selectedPatient.id}</span>
                    {" - "}
                    <span>{selectedPatient.first_name} {selectedPatient.last_name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setFormData(prev => ({ ...prev, patient_id: "" }));
                    }}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Search patient by name or number..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="w-full border p-2 rounded"
                  />
                  
                  {isSearching && (
                    <div className="absolute w-full mt-1 p-2 bg-white border rounded shadow">
                      Searching...
                    </div>
                  )}
                  
                  {patients.length > 0 && (
                    <div className="absolute w-full mt-1 bg-white border rounded shadow max-h-60 overflow-y-auto z-10">
                      {patients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                        >
                          <span className="font-semibold text-blue-600">
                            #{patient.patient_code || patient.id}
                          </span>
                          {" - "}
                          <span>{patient.first_name} {patient.last_name}</span>
                          {patient.phone && (
                            <span className="text-gray-500 text-sm ml-2">
                              • {patient.phone}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {patientSearch.length >= 2 && patients.length === 0 && !isSearching && (
                    <div className="absolute w-full mt-1 p-2 bg-white border rounded shadow text-gray-500">
                      No patients found
                    </div>
                  )}
                  
                  {patientSearch.length > 0 && patientSearch.length < 2 && (
                    <div className="absolute w-full mt-1 p-2 bg-white border rounded shadow text-gray-500 text-sm">
                      Type at least 2 characters to search
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block mb-1 font-medium">Date</label>
          <input
            type="date"
            name="appointment_date"
            value={formData.appointment_date}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        {/* Time */}
        <div>
          <label className="block mb-1 font-medium">Time</label>
          <input
            type="time"
            name="appointment_time"
            value={formData.appointment_time}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        {/* Reason */}
        <div>
          <label className="block mb-1 font-medium">Reason</label>
          <textarea
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            rows="3"
            placeholder="Reason for appointment..."
          />
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg w-full hover:bg-blue-700"
        >
          Book Appointment
        </button>
      </form>
    </div>
    </div>
  );
};

export default AppointmentForm;