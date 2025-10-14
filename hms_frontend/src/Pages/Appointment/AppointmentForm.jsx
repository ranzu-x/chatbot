import React, { useEffect, useState } from "react";
import axios from "axios";

const AppointmentForm = () => {
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [formData, setFormData] = useState({
    doctor_id: "",
    patient_id: "",
    appointment_date: "",
    appointment_time: "",
    reason: "",
  });

  useEffect(() => {
    fetchDoctors();
    fetchPatients();
  }, []);

 const fetchDoctors = async () => {
  try {
    const response = await fetch("http://localhost:5000/api/v1/doctors", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // ✅ very important for JWT cookies
    });

    if (!response.ok) {
      throw new Error("Failed to fetch doctors");
    }

    const data = await response.json();
    setDoctors(data);
  } catch (error) {
    console.error("Error fetching doctors:", error);
  }
};

const fetchPatients = async () => {
  try {
    const response = await fetch("http://localhost:5000/api/v1/patients", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // ✅ send cookies
    });

    if (!response.ok) {
      throw new Error("Failed to fetch patients");
    }

    const data = await response.json();
    setPatients(data);
  } catch (error) {
    console.error("Error fetching patients:", error);
  }
};

//  Using Axios

//  const fetchPatients = async () => {
//     const res = await axios.get("http://localhost:5000/api/v1/patients" , {
//        withCredentials: true // Send cookies with request    
//     });
//     setPatients(res.data);
//   };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  console.log(formData);
  
  try {
    const response = await fetch("http://localhost:5000/api/v1/create-appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData), // ✅ Must stringify the object
      credentials: "include", // ✅ Added comma above
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "DB Failed to create appointment");
    }

    const data = await response.json();
    alert("Appointment created successfully!");
    
    // Reset form
    setFormData({
      doctor_id: "",
      patient_id: "",
      appointment_date: "",
      appointment_time: "",
      reason: "",
    });
    
  } catch (error) {
    console.error("Error:", error);
    alert(error.message || "Failed to create appointment");
  }
};

  return (
    <div className="p-6 max-w-lg mx-auto bg-white shadow-md rounded-2xl">
      <h2 className="text-xl font-semibold mb-4">Create New Appointment</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label>Doctor</label>
          <select name="doctor_id" value={formData.doctor_id} onChange={handleChange} className="w-full border p-2 rounded">
            <option value="">Select Doctor</option>
            {doctors.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.first_name} {doc.last_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Patient</label>
          <select name="patient_id" value={formData.patient_id} onChange={handleChange} className="w-full border p-2 rounded">
            <option value="">Select Patient</option>
            {patients.map((pat) => (
              <option key={pat.id} value={pat.id}>{pat.first_name} {pat.last_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Date</label>
          <input type="date" name="appointment_date" value={formData.appointment_date} onChange={handleChange} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label>Time</label>
          <input type="time" name="appointment_time" value={formData.appointment_time} onChange={handleChange} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label>Reason</label>
          <input type="text" name="reason" value={formData.reason} onChange={handleChange} className="w-full border p-2 rounded" />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg w-full">
          Book Appointment
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
