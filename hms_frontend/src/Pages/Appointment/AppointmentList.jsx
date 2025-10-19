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

  // Appointment status update function
  const updateStatus = async (id, newStatus) => {
    try {
      await axios.put(`/api/appointments/${id}/status`, { status: newStatus });
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: newStatus } : a
        )
      );
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };



  const handleView = (item) => {
    navigate(`/appointments/view/${item.id}`);
  }

  const handleEdit = (item) => {
    navigate(`/appointments/edit/${item.id}`);
  }

  const handleDelete = (item) => {
    const getId = item.id;
  }





  console.log('appointments:', appointments);
  console.log('Is array?', Array.isArray(appointments));

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
          value={row.status}
          onChange={(e) => updateStatus(row.id, e.target.value)}
          className="border p-1 rounded"
        >
          <option value="pending">Scheduled</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      ),
    },

  ]

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
