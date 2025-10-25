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

  //State for loading, errors, and updates
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError(null); // Clear previous errors

      const res = await fetch("http://localhost:5000/api/v1/appointments", {
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setAppointments(data);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      setError("Failed to load appointments. Please try again later."); // User-friendly error message
    } finally {
      setLoading(false); // Always turn off loading
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // ✅ Appointment status update with loading state
  const updateStatus = async (id, newStatus) => {
    try {
      setUpdating(id); // Set updating state to the current appointment ID

      if (newStatus === "confirmed") {
        // Navigate to billing page when confirming
        navigate(`/billing/new?appointment_id=${id}`);
        return; // don’t update immediately — do it after billing is completed
      }

      // else if (newStatus === "completed") {
      // alert("To mark an appointment as completed, please complete the billing process first.");
      // return; // don’t update status
      // }

      // else if (newStatus === "cancelled") {
      //   const reason = prompt("Please provide a reason for cancellation:"); 

      // }

      // else {
      //   navigate(`/appointments/edit/${id}`);
      //   return; // don’t update immediately — do it after billing is completed
      // }

      // Otherwise just update status directly
      await axios.put(`http://localhost:5000/api/v1/appointments/${id}/status`, { status: newStatus }, { withCredentials: true });

      // Update local state
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      );
    } catch (error) {
      console.error("Failed to update status", error);
      alert("Failed to update status. Please try again.");
    } finally {
      setUpdating(null); // Clear updating state
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
      render: (row) => {
        // ✅ Show loading skeleton while THIS row is updating
        if (updating === row.id) {
          return (
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          );
        }

        return (
          <select
            value={row.status}
            onChange={(e) => updateStatus(row.id, e.target.value)}
            className="border p-1 rounded"
            disabled={row.status === "confirmed" || row.status === "completed"}
          >
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        );
      },
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

  // ✅ LOADING STATE: Show spinner while fetching
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

  // ✅ ERROR STATE: Show error message with retry button
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

  // ✅ EMPTY STATE: Show message when no appointments
  // if (appointments.length === 0) {
  //   return (
  //     <div className="p-4 sm:p-8">
  //       <div className="flex items-center justify-center min-h-[400px]">
  //         <div className="text-center">
  //           <p className="text-gray-600 text-lg mb-4">No appointments found</p>
  //           <button
  //             onClick={() => navigate("/appointments/new")}
  //             className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
  //           >
  //             Create First Appointment
  //           </button>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  // ✅ SUCCESS STATE: Show data table
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
