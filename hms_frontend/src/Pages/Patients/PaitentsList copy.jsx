// src/pages/Patients/PatientsList.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
// import FcCalendar from 'react-icons/fc';
import { FaCalendarAlt } from 'react-icons/fa';


function PatientsList() {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const patientsPerPage = 10;
    const navigate = useNavigate();

    useEffect(() => {
        fetch("http://localhost:5000/api/v1/patients", { credentials: "include" })
            .then((res) => {
                if (!res.ok) throw new Error("Fetch error");
                return res.json();
            })
            .then((data) => {
                console.log(data);
                setPatients(data);
            })
            .catch((err) => {
                console.error(err);
                Swal.fire("Error", "Failed to load patients", "error");
            })
            .finally(() => setLoading(false));
    }, []);

    const handleDelete = async (item) => {
        // you already have a sweetalert flow in your original file; call it here
        const id = item.id;
        const result = await Swal.fire({
            title: "Are you sure?",
            text: "This action cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, delete",
        });

        if (!result.isConfirmed) return;

        // call API and update UI
        try {
            const res = await fetch(`http://localhost:5000/patients/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.message || "Delete failed");
            }
            setPatients((prev) => prev.filter((p) => p.id !== id));
            Swal.fire("Deleted", "Patient record deleted.", "success");
        } catch (err) {
            console.error(err);
            Swal.fire("Error", err.message || "Could not delete", "error");
        }
    };

    const handleView = (item) => {
        // you can open your modal or navigate
        navigate(`/patients/view/${item.id}`);
    };

    const handleEdit = (item) => {
        navigate(`/patients/edit/${item.id}`);
    };

    // Search only by phone number
    // const filtered = patients.filter((p) => {
    //     const contact = p.phone ? p.phone.toString().toLowerCase() : "";
    //     const term = search.toLowerCase();
    //     return contact.includes(term);
    // });

// Search by first, last name and phone numbers.
    const filtered = patients.filter((p) => {
        if (!search.trim()) return true; // ✅ show all if search is empty
        const term = search.toLowerCase();
        return (
            p.first_name?.toLowerCase().includes(term) ||
            p.last_name?.toLowerCase().includes(term) ||
            p.phone?.toString().toLowerCase().includes(term)
        );
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / patientsPerPage));
    const currentData = filtered.slice((currentPage - 1) * patientsPerPage, currentPage * patientsPerPage);

    const columns = [
        { header: "#", render: (row, index) => (currentPage - 1) * patientsPerPage + index + 1 },
        { header: "First Name", accessor: "first_name" },
        { header: "Last Name", accessor: "last_name" },
        { header: "Age", accessor: "age" },
        { header: "Gender", accessor: "gender" },
        { header: "Contact", accessor: "phone" },
    ];

    return (
        <div className="p-4 sm:p-8 font-poppins">
            <DataTable
                title="Patient"
                columns={columns}
                data={currentData}
                loading={loading}
                searchTerm={search}
                setSearchTerm={setSearch}
                onAddNew={() => navigate("/addpatient")}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(p) => setCurrentPage(p)}
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
                                // small emoji or component icon allowed
                                icon: <FaCalendarAlt className="text-violet-800" />,  //<>📅</>
                                onClick: (it) => navigate(`/appointments/new?patientId=${it.id}`),
                            },
                        ]} />
                )} />
        </div>
    );
}

export default PatientsList;
