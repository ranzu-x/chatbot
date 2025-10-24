import React, { useEffect, useState } from "react";
import DataTable from "../../Components/Table Components/DataTable";
import axios from "axios";
import TableActions from "../../Components/Table Components/TableActionButtons";
import { useNavigate } from "react-router";

const AppointmentList = () => {
  const [appointments, setAppointments] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const appointmentsPerPage = 10;
  const navigate = useNavigate();

  const fetchAppointments = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/v1/appointments", {
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setAppointments(data);
    } catch (error) {
      console.error("Error fetching appointments:", error);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // ✅ Appointment status update
  const updateStatus = async (id, newStatus) => {
    try {
      if (newStatus === "confirmed") {
        // Navigate to billing page when confirming
        navigate(`/billing/new?appointment_id=${id}`);
        return; // don’t update immediately — do it after billing is completed
      }

      // Otherwise just update status directly
      await axios.put(`http://localhost:5000/api/v1/appointments/${id}/status`, { status: newStatus }, { withCredentials: true });

      // Update local state
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      );
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  // ✅ Manual Billing button
  const handleBilling = (appointment) => {
    navigate(`/billing/new?appointment_id=${appointment.id}`);
  };

  const handleView = (item) => navigate(`/appointments/view/${item.id}`);
  const handleEdit = (item) => navigate(`/appointments/edit/${item.id}`);
  const handleDelete = (item) => console.log("Delete:", item.id);

  const columns = [
    { header: "#", render: (row, index) => (currentPage - 1) * appointmentsPerPage + index + 1 },
    { header: "Name", accessor: "patient_name" },
    { header: "Doctor", accessor: "doctor_name" },
    { header: "Date", accessor: "appointment_date" },
    { header: "Time", accessor: "appointment_time" },
    {
      header: "Status",
      render: (row) => (
        <select
          value={row.status} // show actual status from DB
          onChange={(e) => updateStatus(row.id, e.target.value)}
          className="border p-1 rounded"
          disabled={row.payment_status === "paid"} // disable if payment done
        >
          <option value="pending">Scheduled</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      ),
    },
    {
      header: "Billing",
      render: (row) => (

        <button
          onClick={() => handleBilling(row)}
          className={`py-1 text-sm text-white rounded w-24 
    ${row.payment_status === "paid"
              ? "bg-green-500 cursor-not-allowed"
              : row.status === "confirmed" ||
                row.status === "cancelled" ||
                row.status === "completed"
                ? "bg-gray-400 cursor-not-allowed opacity-70"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          disabled={
            row.payment_status === "paid" ||
            row.status === "confirmed" ||
            row.status === "cancelled" ||
            row.status === "completed"
          }
          title={
            row.payment_status === "paid"
              ? "Payment already made"
              : row.status === "confirmed"
                ? "Appointment confirmed"
                : row.status === "cancelled"
                  ? "Appointment cancelled"
                  : row.status === "completed"
                    ? "Appointment completed"
                    : "Create a bill"
          }
        >
          {row.payment_status === "paid" ? "Paid" : "Make Bill"}
        </button>

      ),
    }

  ];

  return (
    <div className="p-4 sm:p-8">
      <DataTable
        title="Appointment"
        columns={columns}
        data={appointments}
        onAddNew={() => navigate("/appointments/new")}
        actions={(item) => (
          <TableActions
            item={item}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      />
    </div>
  );
};

export default AppointmentList;
