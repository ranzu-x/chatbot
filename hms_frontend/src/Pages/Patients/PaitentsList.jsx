import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import PatientViewModal from "./PatientViewModal";
import { FaCalendarAlt } from "react-icons/fa";

function PatientsList() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [patientsPerPage, setPatientsPerPage] = useState(10);
  const [totalPatients, setTotalPatients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();

  // ✅ Stable fetch function (no dependencies that change often)
  const fetchPatients = useCallback(async (page, limit, searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(
        `http://localhost:5000/api/v1/patients?${params}`,
        { credentials: "include" }
      );

      if (!response.ok) throw new Error("Fetch error");

      const data = await response.json();
      console.log("✅ Patients fetched:", data);

      setPatients(data.patients);
      setTotalPatients(data.pagination.totalPatients);
      setTotalPages(data.pagination.totalPages);
      setCurrentPage(data.pagination.currentPage);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to load patients", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Single effect to handle all changes (page, limit, search)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPatients(currentPage, patientsPerPage, search);
    }, 400);

    return () => clearTimeout(timer);
  }, [currentPage, patientsPerPage, search, fetchPatients]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePatientsPerPageChange = (newSize) => {
    setPatientsPerPage(parseInt(newSize));
    setCurrentPage(1);
  };

  const handleDelete = async (item) => {
    const id = item.id;
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`http://localhost:5000/api/v1/patients/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || "Delete failed");
      }

      fetchPatients(currentPage, patientsPerPage, search);
      Swal.fire("Deleted", "Patient record deleted.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message || "Could not delete", "error");
    }
  };

      // Fetch patient data for viewing
    const handleView = async (item) => {
        try {
            const response = await fetch(`http://localhost:5000/api/v1/patients/${item.id}`, {
                credentials: "include"
            });
            
            if (!response.ok) throw new Error("Failed to fetch patient details");
            
            const patientData = await response.json();
            setSelectedPatient(patientData);
            setIsViewModalOpen(true);
        } catch (error) {
            console.error("Error fetching patient details:", error);
            Swal.fire("Error", "Failed to load patient details", "error");
        }
    };

    const closeViewModal = () => {
        setIsViewModalOpen(false);
        setSelectedPatient(null);
    };

  // const handleView = (item) => navigate(`/patients/view/${item.id}`);
  const handleEdit = (item) => navigate(`/patients/edit/${item.id}`);

  const columns = [
    {
      header: "#",
      render: (row, index) => (currentPage - 1) * patientsPerPage + index + 1,
    },
    { header: "First Name", accessor: "first_name" },
    { header: "Last Name", accessor: "last_name" },
    { header: "Age", accessor: "age" },
    { header: "Gender", accessor: "gender" },
    { header: "Contact", accessor: "phone" },
    { header: "Email", accessor: "email" },
    { header: "Blood Group", accessor: "blood_group" },
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      <DataTable
        title="Patient"
        columns={columns}
        data={patients}
        loading={loading}
        searchTerm={search}
        setSearchTerm={setSearch}
        onAddNew={() => navigate("/patients/add")}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalPatients}
        itemsPerPage={patientsPerPage}
        onItemsPerPageChange={handlePatientsPerPageChange}
        onPageChange={handlePageChange}
        actions={(item) => (
          <TableActions
            item={item}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            extraActions={[
              {
                key: "appointment",
                label: "Appointment",
                icon: <FaCalendarAlt className="text-violet-800" />,
                onClick: (it) =>
                  navigate(`/appointments/new?patientId=${it.id}`),
              },
            ]}
          />
        )}
      />
      <PatientViewModal
                patient={selectedPatient}
                isOpen={isViewModalOpen}
                onClose={closeViewModal}
            />
    </div>
  );
}

export default PatientsList;
