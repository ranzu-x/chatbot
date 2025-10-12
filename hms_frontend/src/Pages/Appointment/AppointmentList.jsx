import React, { useEffect, useState } from "react";
import axios from "axios";

const AppointmentList = () => {
  const [appointments, setAppointments] = useState([]);

const fetchAppointments = async () => {
  try {
    const res = await fetch("/api/v1/appointments");
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const data = await res.json();
    setAppointments(data);
  } catch (error) {
    console.error("Error fetching appointments:", error);
  }
};

  useEffect(() => {
    fetchAppointments();
  }, []);

  const updateStatus = async (id, status) => {
    await axios.put(`/api/v1/appointments/${id}/status`, { status });
    fetchAppointments();
  };

  console.log('appointments:', appointments);
console.log('Is array?', Array.isArray(appointments));

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Appointments</h2>
      <table className="w-full border-collapse border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Patient</th>
            <th className="border p-2">Doctor</th>
            <th className="border p-2">Date</th>
            <th className="border p-2">Time</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr key={a.id}>
              <td className="border p-2">{a.patient_name}</td>
              <td className="border p-2">{a.doctor_name}</td>
              <td className="border p-2">{a.appointment_date}</td>
              <td className="border p-2">{a.appointment_time}</td>
              <td className="border p-2 capitalize">{a.status}</td>
              <td className="border p-2">
                <select onChange={(e) => updateStatus(a.id, e.target.value)} value={a.status} className="border p-1 rounded">
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AppointmentList;
