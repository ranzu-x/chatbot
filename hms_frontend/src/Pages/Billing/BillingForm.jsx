import React, { useState, useEffect } from "react";
import axios from "axios";

const BillingForm = () => {
  const [appointments, setAppointments] = useState([]);
  const [formData, setFormData] = useState({
    appointment_id: "",
    doctor_fee: "",
    discount: "",
    payment_method: "cash",
  });

  useEffect(() => {
    fetchCompletedAppointments();
  }, []);

  const fetchCompletedAppointments = async () => {
    const res = await axios.get("/api/appointments");
    const completed = res.data.filter((a) => a.status === "completed");
    setAppointments(completed);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post("/api/billing", formData);
    alert("Bill generated successfully!");
    setFormData({ appointment_id: "", doctor_fee: "", discount: "", payment_method: "cash" });
  };

  return (
    <div className="p-6 max-w-lg mx-auto bg-white shadow rounded-xl">
      <h2 className="text-xl font-semibold mb-4">Generate Bill</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label>Appointment</label>
          <select name="appointment_id" value={formData.appointment_id} onChange={handleChange} className="w-full border p-2 rounded">
            <option value="">Select Appointment</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.patient_name} - {a.doctor_name} ({a.appointment_date})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Doctor Fee</label>
          <input type="number" name="doctor_fee" value={formData.doctor_fee} onChange={handleChange} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label>Discount</label>
          <input type="number" name="discount" value={formData.discount} onChange={handleChange} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label>Payment Method</label>
          <select name="payment_method" value={formData.payment_method} onChange={handleChange} className="w-full border p-2 rounded">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile</option>
            <option value="insurance">Insurance</option>
          </select>
        </div>
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg w-full">
          Generate Bill
        </button>
      </form>
    </div>
  );
};

export default BillingForm;
