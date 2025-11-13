import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import { FaFilePrescription, FaCalendarPlus } from "react-icons/fa";
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
  const updateStatus = async (id, newStatus, reason = null) => {
    try {
      setUpdating(id);
      const payload = { status: newStatus };
      if (reason) payload.cancellation_reason = reason;
      
      await axios.put(
        `http://localhost:5000/api/v1/appointments/${id}/status`,
        payload,
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

  // ✅ Enhanced cancellation with reason
  const handleCancel = async (appointment) => {
    const { value: reason } = await Swal.fire({
      title: 'Cancel Appointment',
      input: 'select',
      inputOptions: {
        'patient_request': 'Patient Request',
        'doctor_unavailable': 'Doctor Unavailable', 
        'emergency': 'Emergency',
        'rescheduled': 'Rescheduled',
        'other': 'Other'
      },
      inputPlaceholder: 'Select cancellation reason',
      showCancelButton: true,
      confirmButtonText: 'Cancel Appointment',
      confirmButtonColor: '#d33',
    });

    if (reason) {
      // Check if payment was made for refund logic
      if (appointment.payment_status === 'paid') {
        Swal.fire({
          title: 'Payment Refund',
          text: 'This appointment has been paid. Refund process will be initiated.',
          icon: 'warning',
          confirmButtonText: 'Proceed with Cancellation'
        });
      }
      
      await updateStatus(appointment.id, 'cancelled', reason);
    }
  };

  // ✅ Reschedule from cancelled appointment
  const handleRescheduleFromCancelled = (cancelledAppointment) => {
    navigate('/appointments/new', {
      state: {
        patientId: cancelledAppointment.patient_id,
        doctorId: cancelledAppointment.doctor_id,
        prefillData: {
          patient_name: cancelledAppointment.patient_name,
          doctor_name: cancelledAppointment.doctor_name,
          // Carry over other relevant details
        }
      }
    });
  };

  // ✅ Process payment for scheduled appointments
  const handleProcessPayment = (appointment) => {
    navigate(`/billing/new?appointment_id=${appointment.id}`);
  };

  // ✅ Mark as completed (only if paid)
  const handleComplete = async (appointment) => {
    if (appointment.payment_status !== 'paid') {
      toast.error('Cannot complete appointment without payment');
      return;
    }
    
    await updateStatus(appointment.id, 'completed');
  };

  const handleView = (item) => navigate(`/appointments/view/${item.id}`);
  const handleEdit = (item) => navigate(`/appointments/edit/${item.id}`);
  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This appointment will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      confirmButtonColor: "#d33",
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
      header: "Payment",
      render: (row) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          row.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
          row.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {row.payment_status?.toUpperCase() || 'UNPAID'}
        </span>
      ),
    },
    {
      header: "Status",
      render: (row) => (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className={`text-xs font-medium px-2 py-1 rounded text-center ${
            row.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
            row.status === 'confirmed' ? 'bg-green-100 text-green-800 border border-green-200' :
            row.status === 'completed' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
            row.status === 'cancelled' ? 'bg-red-100 text-red-800 border border-red-200' :
            'bg-gray-100 text-gray-800 border border-gray-200'
          }`}>
            {row.status.toUpperCase()}
          </span>
          
          {/* Action buttons based on status */}
          {row.status === 'scheduled' && (
            <button 
              onClick={() => handleProcessPayment(row)}
              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors"
            >
              Process Payment
            </button>
          )}
          
          {row.status === 'confirmed' && (
            <button 
              onClick={() => handleComplete(row)}
              disabled={updating === row.id}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {updating === row.id ? '...' : 'Mark Completed'}
            </button>
          )}
        </div>
      ),
    },
    {
      header: "Actions",
      render: (row) => (
        <div className="flex flex-col gap-1">
          {/* Cancel button for active appointments */}
          {(row.status === 'scheduled' || row.status === 'confirmed') && (
            <button 
              onClick={() => handleCancel(row)}
              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors"
            >
              Cancel
            </button>
          )}
          
          {/* Reschedule for scheduled appointments */}
          {row.status === 'scheduled' && (
            <button 
              onClick={() => navigate(`/appointments/edit/${row.id}`)}
              className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 transition-colors"
            >
              Reschedule
            </button>
          )}
        </div>
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
              // Reschedule for cancelled appointments
              ...(item.status === 'cancelled' ? [
                {
                  key: "reschedule",
                  label: "Create New Appointment",
                  icon: <FaCalendarPlus className="text-green-600" />,
                  onClick: (it) => handleRescheduleFromCancelled(it)
                }
              ] : []),
              
              // Prescription for doctors
              ...(hasRole("doctor") && can("prescriptions", "create") && item.status !== 'cancelled' ? [
                {
                  key: "prescription",
                  label: "Create Prescription",
                  icon: <FaFilePrescription className="text-purple-600" />,
                  onClick: (it) => navigate(`/prescription/new?patientId=${it.patient_id}&appointmentId=${it.id}`),
                },
              ] : [
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