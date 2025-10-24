import React, { useEffect, useState } from "react";
import DataTable from "../../Components/Table Components/DataTable";
import axios from "axios";
import TableActions from "../../Components/Table Components/TableActionButtons";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";

const AppointmentList = () => {
  const [appointments, setAppointments] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const appointmentsPerPage = 10;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);

  // ✅ Fetch appointments
  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("http://localhost:5000/api/v1/appointments", {
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();
      setAppointments(data);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      setError("Failed to load appointments. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // ✅ Navigate for different status actions
  const handleStatusChange = (id, newStatus) => {
    if (newStatus === "confirmed") {
      navigate(`/billing/new?appointment_id=${id}`);
      return;
    }

    if (newStatus === "completed") {
      toast.error("Please complete the billing before marking as completed.");
      return;
    }

    if (newStatus === "cancelled") {
      toast("Appointment cancelled successfully.", { icon: "⚠️" });
      updateStatus(id, newStatus);
      return;
    }

    // For editing or other cases
    navigate(`/appointments/edit/${id}`);
  };

  // ✅ Backend status update
  const updateStatus = async (id, newStatus) => {
    try {
      setUpdating(id);

      await axios.put(
        `http://localhost:5000/api/v1/appointments/${id}/status`,
        { status: newStatus },
        { withCredentials: true }
      );

      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      );

      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      console.error("Failed to update status", error);
      toast.error("Failed to update status. Please try again.");
    } finally {
      setUpdating(null);
    }
  };

  // ✅ Manual Billing button
  const handleBilling = (appointment) => {
    navigate(`/billing/new?appointment_id=${appointment.id}`);
  };

  const handleView = (item) => navigate(`/appointments/view/${item.id}`);
  const handleEdit = (item) => navigate(`/appointments/edit/${item.id}`);
  const handleDelete = (item) => console.log("Delete:", item.id);

  // ✅ Table columns
  const columns = [
    { header: "#", render: (row, index) => (currentPage - 1) * appointmentsPerPage + index + 1 },
    { header: "Name", accessor: "patient_name" },
    { header: "Doctor", accessor: "doctor_name" },
    { header: "Date", accessor: "appointment_date" },
    { header: "Time", accessor: "appointment_time" },
    {
      header: "Status",
      render: (row) => (
        updating === row.id ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <select
            value={row.status}
            onChange={(e) => handleStatusChange(row.id, e.target.value)}
            className="border p-1 rounded"
            disabled={row.status === "confirmed" || row.status === "completed"}
          >
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )
      ),
    },
    {
      header: "Billing",
      render: (row) => (
        <button
          onClick={() => handleBilling(row)}
          className={`py-1 text-sm text-white rounded w-24 transition-all 
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
    },
  ];

  // ✅ LOADING STATE
  if (loading) {
    return (
      <div className="p-4 sm:p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading appointments...</p>
        </div>
      </div>
    );
  }

  // ✅ ERROR STATE
  if (error) {
    return (
      <div className="p-4 sm:p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
          <button
            onClick={fetchAppointments}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ✅ EMPTY STATE
  if (appointments.length === 0) {
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-gray-600 text-lg mb-4">No appointments found</p>
            <button
              onClick={() => navigate("/appointments/new")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
            >
              Create First Appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ SUCCESS STATE
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
