import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import { FaFilePrescription, FaCalendarPlus, FaInfoCircle } from "react-icons/fa";
import { MdOutlineSmsFailed } from "react-icons/md";
import toast from "react-hot-toast";
import { usePermissions } from "../../hooks/usePermissions";
import {
  fetchAppointments as fetchAppointmentsAPI,
  updateAppointmentStatus,
  deleteAppointment,
} from "../../services/appointmentService";

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

  // ✅ Stable fetch function with pagination + search (using appointmentService)
  const fetchAppointments = useCallback(async (page, limit, searchTerm) => {
    setLoading(true);
    try {
      const data = await fetchAppointmentsAPI(page, limit, searchTerm);

      setAppointments(data.appointments);
      setTotalAppointments(data.pagination.totalAppointments);
      setTotalPages(data.pagination.totalPages);
      setCurrentPage(data.pagination.currentPage);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.response?.data?.message || "Failed to load appointments", "error");
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

  // ✅ Update status API (using appointmentService)
  const updateStatus = async (id, newStatus, reason = null) => {
    try {
      setUpdating(id);

      await updateAppointmentStatus(id, newStatus, reason);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      );
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to update status");
    } finally {
      setUpdating(null);
    }
  };

  // ✅ Smart status change handler
  const handleStatusChange = async (appointment, newStatus) => {
    // Block status changes for completed appointments (except hospital_admin)
    if (appointment.status === "completed" && !hasRole("hospital_admin")) {
      toast.error("Cannot change status of completed appointment");
      return;
    }

    // Payment required for confirmation
    if (newStatus === "confirmed" && appointment.payment_status !== "paid") {
      const result = await Swal.fire({
        title: "Payment Required",
        text: "Appointment confirmation requires payment. Process payment now?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Process Payment",
        cancelButtonText: "Cancel"
      });

      if (result.isConfirmed) {
        navigate(`/billing/new?appointment_id=${appointment.id}`);
      }
      return;
    }

    // Only doctors can mark as completed
    if (newStatus === "completed" && !hasRole("doctor")) {
      toast.error("Only doctors can complete appointments");
      return;
    }

    // Payment check for completion
    if (newStatus === "completed" && appointment.payment_status !== "paid") {
      toast.error("Cannot complete appointment without payment");
      return;
    }

    // Cancellation with reason
    if (newStatus === "cancelled") {
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
        if (appointment.payment_status === 'paid') {
          Swal.fire({
            title: 'Payment Refund',
            text: 'This appointment has been paid. Refund process will be initiated.',
            icon: 'warning',
            confirmButtonText: 'Proceed with Cancellation'
          });
        }
        await updateStatus(appointment.id, newStatus, reason);
      }
      return;
    }

    // Direct status update for other cases
    await updateStatus(appointment.id, newStatus);
  };

  // ✅ Get status options with disabled states and reasons
  const getStatusOptions = (appointment) => {
    const baseOptions = [
      { value: "scheduled", label: "Scheduled" },
      { value: "confirmed", label: "Confirmed" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" }
    ];

    return baseOptions.map(option => {
      let disabled = false;
      let disabledReason = "";

      // Hospital admin can change any status
      if (hasRole("hospital_admin")) {
        disabled = false;
      }
      // For completed appointments - no one can change except hospital_admin
      else if (appointment.status === "completed") {
        disabled = true;
        disabledReason = "Completed appointments cannot be modified";
      }
      // Regular logic for other users
      else {
        switch (option.value) {
          case "confirmed":
            disabled = appointment.payment_status !== "paid";
            disabledReason = disabled ? "Payment required" : "";
            break;
          case "completed":
            disabled = !hasRole("doctor") || appointment.payment_status !== "paid";
            disabledReason = disabled ?
              (appointment.payment_status !== "paid" ? "Payment required" : "Only doctors can complete")
              : "";
            break;
          case "scheduled":
            disabled = appointment.status === "completed" ||
              appointment.status === "cancelled" ||
              appointment.status === "confirmed";
            disabledReason = disabled ? "Cannot revert to scheduled" : "";
            break;
        }
      }

      return { ...option, disabled, disabledReason };
    });
  };

  // ✅ Check if status dropdown should be shown
  const shouldShowStatusDropdown = (appointment) => {
    // Hospital admin can always change status
    if (hasRole("hospital_admin")) return true;

    // No one can change completed appointments except hospital_admin
    if (appointment.status === "completed") return false;

    // Doctors can change to completed, others can change to other statuses
    return true;
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
        }
      }
    });
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
      await deleteAppointment(item.id);
      
      // ✅ Fix pagination bug: validate current page still exists
      // If we deleted an item, calculate max possible page and adjust if needed
      const newTotal = totalAppointments - 1;
      const maxPossiblePage = Math.ceil(newTotal / appointmentsPerPage);
      const pageToFetch = currentPage > maxPossiblePage && maxPossiblePage > 0 ? maxPossiblePage : currentPage;
      
      fetchAppointments(pageToFetch, appointmentsPerPage, search);
      Swal.fire("Deleted!", "Appointment has been deleted.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.response?.data?.message || "Failed to delete appointment", "error");
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
        <div className="flex flex-col gap-2 items-center">

          {/* Single Payment Button */}
          <button
            onClick={() => row.payment_status !== 'paid' && navigate(`/billing/new?appointment_id=${row.id}`)}
            disabled={row.payment_status === 'paid' || row.status === 'cancelled'}
            className={`w-24 text-xs px-2 py-1 rounded transition-colors ${row.payment_status === 'paid'
              ? 'bg-green-200 text-gray-500 cursor-not-allowed'
              : row.status === 'cancelled'
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200'
              }`}
          >
            {row.payment_status === 'paid' ? 'Paid' : 'Make Payment'}
          </button>
        </div>
      ),
    },
    {
      header: "Status",
      render: (row) => (
        <div className="flex flex-col gap-2">
          {/* Current Status Badge */}
          <span className={`text-xs font-medium px-2 py-1 rounded text-center ${row.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
            row.status === 'confirmed' ? 'bg-green-100 text-green-800 border border-green-200' :
              row.status === 'completed' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                row.status === 'cancelled' ? 'bg-red-100 text-red-800 border border-red-200' :
                  'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
            {row.status.toUpperCase()}
          </span>

          {/* Smart Status Dropdown - Conditionally rendered */}
          {updating === row.id ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : shouldShowStatusDropdown(row) ? (
            <select
              value={row.status}
              onChange={(e) => handleStatusChange(row, e.target.value)}
              className="text-xs border border-gray-300 rounded p-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {getStatusOptions(row).map(option => {
                // Build option label with disabled reason if applicable
                const optionLabel = option.disabled && option.disabledReason 
                  ? `${option.label} (${option.disabledReason})` 
                  : option.label;
                
                return (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    title={option.disabledReason || ""}
                  >
                    {optionLabel}
                  </option>
                );
              })}
            </select>
          ) : (
            // Show locked message for completed appointments
            row.status === "completed" && (
              <span className="text-xs text-gray-500 text-center">
                Status Locked
              </span>
            )
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

              // Prescription for doctors - only for non-cancelled appointments
              ...(hasRole("doctor") && can("prescriptions", "create") && item.status !== 'cancelled' ? [
                {
                  key: "prescription",
                  label: "Create Prescription",
                  icon: <FaFilePrescription className="text-purple-600" />,
                  onClick: (it) => navigate(`/prescription/new?patientId=${it.patient_id}&appointmentId=${it.id}`),
                },
              ] : []),
            ]}
          />
        )}
      />
    </div>
  );
}

export default AppointmentList;