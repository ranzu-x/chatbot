import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import { FaFilePrescription } from "react-icons/fa";
import { MdOutlineSmsFailed } from "react-icons/md";
import toast from "react-hot-toast";
import axios from "axios";
import { usePermissions } from "../../hooks/usePermissions";

function AppointmentList() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [appointmentsPerPage, setAppointmentsPerPage] = useState(10);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [updating, setUpdating] = useState(null);
  const navigate = useNavigate();
  const { hasRole, can } = usePermissions();

  // ✅ Stable fetch function with pagination + search
  const fetchAppointments = useCallback(async (page, limit, searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(
        `http://localhost:5000/api/v1/appointments?${params}`,
        { credentials: "include" }
      );

      if (!response.ok) throw new Error("Failed to load appointments");

      const data = await response.json();
      console.log("✅ Appointments fetched:", data);

      setAppointments(data.appointments);
      setTotalAppointments(data.pagination.totalAppointments);
      setTotalPages(data.pagination.totalPages);
      setCurrentPage(data.pagination.currentPage);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to load appointments", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Effect handles pagination, search, etc.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAppointments(currentPage, appointmentsPerPage, search);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentPage, appointmentsPerPage, search, fetchAppointments]);

  const handlePageChange = (page) => setCurrentPage(page);

  const handleItemsPerPageChange = (newSize) => {
    setAppointmentsPerPage(parseInt(newSize));
    setCurrentPage(1);
  };

  // ✅ Update status API
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
      console.error(error);
      toast.error("Failed to update status");
    } finally {
      setUpdating(null);
    }
  };

  // ✅ Status dropdown logic
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
    updateStatus(id, newStatus);
  };

  // ✅ Delete appointment
  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This appointment will be deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(
        `http://localhost:5000/api/v1/appointments/${item.id}`,
        { method: "DELETE", credentials: "include" }
      );

      if (!res.ok) throw new Error("Delete failed");

      fetchAppointments(currentPage, appointmentsPerPage, search);
      Swal.fire("Deleted!", "Appointment has been deleted.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to delete appointment", "error");
    }
  };

  const handleView = (item) => navigate(`/appointments/view/${item.id}`);
  const handleEdit = (item) => navigate(`/appointments/edit/${item.id}`);
  const handleBilling = (item) => navigate(`/billing/new?appointment_id=${item.id}`);

  const columns = [
    {
      header: "#",
      render: (row, index) =>
        (currentPage - 1) * appointmentsPerPage + index + 1,
    },
    { header: "Patient", accessor: "patient_name" },
    { header: "Doctor", accessor: "doctor_name" },
    { header: "Date", accessor: "appointment_date" },
    { header: "Time", accessor: "appointment_time" },
    {
      header: "Status",
      render: (row) =>
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
        ),
    },
    {
      header: "Billing",
      render: (row) => (
        <button
          onClick={() => handleBilling(row)}
          className={`py-1 text-sm text-white rounded w-24 transition-all 
            ${
              row.payment_status === "paid"
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
        >
          {row.payment_status === "paid" ? "Paid" : "Make Bill"}
        </button>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      <DataTable
        title="Appointment"
        columns={columns}
        data={appointments}
        loading={loading}
        searchTerm={search}
        setSearchTerm={setSearch}
        onAddNew={() => navigate("/appointments/new")}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalAppointments}
        itemsPerPage={appointmentsPerPage}
        onItemsPerPageChange={handleItemsPerPageChange}
        onPageChange={handlePageChange}
        actions={(item) => (
          <TableActions
            item={item}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            extraActions={[
              ...(hasRole("doctor") && can("prescriptions", "create")
                ? [
                    {
                      key: "prescription",
                      label: "Create Prescription",
                      icon: <FaFilePrescription className="text-purple-600" />,
                      onClick: (it) =>
                        navigate(`/prescription?patientId=${it.id}`),
                    },
                  ]
                : [
                    {
                      icon: <MdOutlineSmsFailed className="text-gray-400" />,
                    },
                  ]),
            ]}
          />
        )}
      />
    </div>
  );
}

export default AppointmentList;
