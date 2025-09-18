import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import {
    XCircleIcon,
    UserCircleIcon,
} from '@heroicons/react/24/outline';

const PatientsList = () => {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [selectedData, setSelectedData] = useState('');
    const navigate = useNavigate();

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [patientsPerPage] = useState(15); // You can adjust this value

    // Fetch patients
    const fetchPatients = () => {
        setLoading(true);
        fetch("http://192.168.0.100:5000/patients")
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then((data) => {
                setPatients(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Error fetching patients:", err);
                setLoading(false);
                Swal.fire({
                    icon: 'error',
                    title: 'Oops...',
                    text: 'Failed to fetch patients. Please ensure the server is running and try again.',
                    customClass: {
                        popup: 'rounded-xl shadow-2xl backdrop-blur-md bg-white/80',
                        title: 'text-gray-800 text-xl font-bold',
                        confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2 transition-colors duration-200'
                    }
                });
            });
    };

    useEffect(() => {
        fetchPatients();
    }, []);

    // Handle delete with SweetAlert
    const handleDelete = async (id) => {
        Swal.fire({
            title: "Are you sure?",
            text: "You are about to delete a patient record. This action cannot be undone!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#EF4444", // Red-500
            cancelButtonColor: "#6B7280", // Gray-500
            confirmButtonText: "Yes, delete it!",
            cancelButtonText: "No, cancel",
            customClass: {
                popup: 'rounded-xl shadow-2xl backdrop-blur-md bg-white/80',
                title: 'text-gray-800 text-xl font-bold',
                htmlContainer: 'text-gray-700',
                confirmButton: 'bg-red-500 hover:bg-red-600 text-white rounded-lg px-6 py-2 transition-colors duration-200',
                cancelButton: 'bg-gray-500 hover:bg-gray-600 text-white rounded-lg px-6 py-2 transition-colors duration-200 ml-3'
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const res = await fetch(`http://192.168.0.100:5000/patients/${id}`, {
                        method: "DELETE",
                    });

                    if (res.ok) {
                        setPatients((prev) => prev.filter((p) => p.id !== id));
                        Swal.fire({
                            title: "Deleted!",
                            text: "Patient record has been deleted successfully.",
                            icon: "success",
                            customClass: {
                                popup: 'rounded-xl shadow-2xl backdrop-blur-md bg-white/80',
                                title: 'text-gray-800 text-xl font-bold',
                                confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2 transition-colors duration-200'
                            }
                        });
                        // After deletion, re-evaluate current page to prevent empty pages
                        setCurrentPage(prevPage => {
                            const totalFiltered = filteredPatients.length - 1; // One less patient
                            const maxPage = Math.ceil(totalFiltered / patientsPerPage);
                            return prevPage > maxPage ? Math.max(1, maxPage) : prevPage;
                        });
                    } else {
                        const errorData = await res.json();
                        Swal.fire({
                            icon: 'error',
                            title: 'Failed to Delete',
                            text: errorData.message || "An error occurred while deleting the patient.",
                            customClass: {
                                popup: 'rounded-xl shadow-2xl backdrop-blur-md bg-white/80',
                                title: 'text-gray-800 text-xl font-bold',
                                confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2 transition-colors duration-200'
                            }
                        });
                    }
                } catch (err) {
                    console.error("Delete error:", err);
                    Swal.fire({
                        icon: 'error',
                        title: 'Network Error',
                        text: "Could not connect to the server. Please check your connection.",
                        customClass: {
                            popup: 'rounded-xl shadow-2xl backdrop-blur-md bg-white/80',
                            title: 'text-gray-800 text-xl font-bold',
                            confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2 transition-colors duration-200'
                        }
                    });
                }
            }
        });
    };

    // Edit patient
    const handleEdit = (id) => {
        navigate(`/patients/edit/${id}`);
    };

    // View patient details
    const handleView = (id) => {
        const item = patients.filter(p => p.id == id)
        setSelectedData(item);
        openModal(selectedData)
        // navigate(`/patients/${id}`);
    };
    console.log(selectedData);

    // View patient details modal open
    const openModal = (item) => {
        setIsOpen(true);
    };
    // View patient details modal Close
    const closeModal = () => {
        setIsOpen(false);
        setSelectedData('');
    };

    // Search only by phone number
    const filteredPatients = patients.filter((p) => {
        const contact = p.phone ? p.phone.toString().toLowerCase() : "";
        const term = search.toLowerCase();
        return contact.includes(term);
    });

    // Get current patients for pagination
    const indexOfLastPatient = currentPage * patientsPerPage;
    const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
    const currentPatients = filteredPatients.slice(indexOfFirstPatient, indexOfLastPatient);

    // Calculate total pages
    const totalPages = Math.ceil(filteredPatients.length / patientsPerPage);

    // Change page
    const paginate = (pageNumber) => {
        if (pageNumber > 0 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
        }
    };

    // Reset page to 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [search, patients]); // Also reset if patients data changes (e.g., after delete)

    const renderPageNumbers = () => {
        const pageNumbers = [];
        const maxPageButtons = 5; // Number of page buttons to show around the current page
        let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

        if (endPage - startPage + 1 < maxPageButtons) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pageNumbers.push(
                <button
                    key={i}
                    onClick={() => paginate(i)}
                    className={`min-w-[40px] px-3 py-2 rounded-lg font-medium transition-all duration-200 ${currentPage === i
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                        }`}
                >
                    {i}
                </button>
            );
        }
        return pageNumbers;
    };
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 p-4 sm:p-8 font-poppins text-gray-800">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-extrabold text-center mb-10 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 drop-shadow-lg">
                    Patient Dashboard
                </h1>


                {/* Patients Table */}
                <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow overflow-hidden border border-white border-opacity-60 transform transition-all duration-300">
                    {/* Search and Add Patient */}
                    <div className="mt-4 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 sm:space-x-4 p-5 ">
                        <div className="relative w-full sm:w-80">


                            <input
                                type="text"
                                placeholder="Search by contact..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-full bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all duration-200 text-base shadow-sm"
                            />
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                        </div>
                        <button
                            onClick={() => navigate("/patients/new")}
                            className="w-full sm:w-auto px-8 py-3 bg-indigo-500 text-white font-semibold rounded-full shadow-lg hover:from-indigo-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white transition-all duration-300 flex items-center justify-center space-x-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                            </svg>
                            <span>Add New Patient</span>
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-center">
                            <thead className="bg-indigo-600 text-white shadow-md">
                                <tr>
                                    <th className="p-4 text-sm font-semibold tracking-wide uppercase">#</th>
                                    <th className="p-4 text-sm font-semibold tracking-wide uppercase">Name</th>
                                    <th className="p-4 text-sm font-semibold tracking-wide uppercase">Age</th>
                                    <th className="p-4 text-sm font-semibold tracking-wide uppercase">Gender</th>
                                    <th className="p-4 text-sm font-semibold tracking-wide uppercase">Contact</th>
                                    <th className="p-4 text-sm font-semibold tracking-wide uppercase text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-10 text-indigo-600 text-xl animate-pulse">
                                            <div className="flex items-center justify-center space-x-3">
                                                <svg className="animate-spin h-7 w-7 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span>Loading patient data...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : currentPatients.length > 0 ? (
                                    currentPatients.map((patient, index) => (
                                        <tr
                                            key={patient.id}
                                            className="even:bg-gray-50/50 odd:bg-white/50 hover:bg-indigo-50/70 transition-colors duration-200"
                                        >
                                            <td className="p-4 text-gray-700 text-base">{(currentPage - 1) * patientsPerPage + index + 1}</td>
                                            <td className="p-4 font-medium text-gray-900 text-base">{patient.name}</td>
                                            <td className="p-4 text-gray-700 text-base">{patient.age}</td>
                                            <td className="p-4 text-gray-700 text-base">{patient.gender}</td>
                                            <td className="p-4 text-gray-700 text-base">{patient.phone}</td>
                                            <td className="p-4 text-center">
                                                <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-2">
                                                    <button
                                                        onClick={() => handleView(patient.id)}
                                                        className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold shadow-md hover:from-green-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 transition-all duration-200"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => handleEdit(patient.id)}
                                                        className="px-4 py-2 bg-amber-400 text-white rounded-lg text-sm font-semibold shadow-md hover:from-yellow-600 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 transition-all duration-200"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(patient.id)}
                                                        className="px-4 py-2 bg-rose-400 text-white rounded-lg text-sm font-semibold shadow-md hover:from-red-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 transition-all duration-200"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="text-center py-10 text-gray-500 text-xl">
                                            <div className="flex flex-col items-center justify-center">
                                                <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                </svg>
                                                <p className="font-semibold">No patients found.</p>
                                                <p className="text-base text-gray-400">Try adjusting your search or add a new patient.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center space-x-2 mt-8 p-4 bg-white/70 backdrop-blur-md rounded-b-2xl border border-white border-opacity-60">
                            <button
                                onClick={() => paginate(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center space-x-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                                <span className="hidden sm:inline">Previous</span>
                            </button>

                            <div className="flex space-x-1 overflow-x-auto hide-scrollbar">
                                {renderPageNumbers()}
                            </div>

                            <button
                                onClick={() => paginate(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center space-x-1"
                            >
                                <span className="hidden sm:inline">Next</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                            </button>
                        </div>
                    )}
                </div>

            </div>

            {/* Modal */}
            {isOpen && selectedData && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg shadow-lg min-w-fit relative">
                        <div>
                            <div>
                                {/* Profile Overview */}
                                <div className="flex items-center justify-center gap-4 mb-6">
                                    <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-700">
                                        {selectedData.image?.[0] || <UserCircleIcon className="size-16 text-blue-300" />}
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900"> {selectedData[0].name}</p>
                                        <div className="flex items-center gap-5">
                                            <p className="text-gray-600">{selectedData[0].gender} • {selectedData[0].age} years</p>
                                            <p className="text-sm text-gray-500">Blood Group: {selectedData[0].bloodGroup || `N/A`}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* All Data Display */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-500">Phone Number</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].phoneNumber || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Email</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].email || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Present Address</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].presentAddress || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Permanent Address</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].permanentAddress || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Father/Husband Name</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].fatherOrHusbandName || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Mother Name</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].motherName || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">NID</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].nid || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Emergency Contact Name</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].emergencyContactName || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Emergency Contact Relation</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].emergencyContactRelation || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Emergency Contact Phone</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].emergencyContactPhone || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Department</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].department || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Consultant Doctor</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].consultantDoctor || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Admission Date</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].admissionDate || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Ward</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].ward || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Bed Number</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].bedNumber || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Past Conditions</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].pastConditions || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Current Medications</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].currentMedications || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">Allergies</p>
                                        <p className="text-gray-800 font-medium">{selectedData[0].allergies || "N/A"}</p>
                                    </div>
                                </div>
                            </div>

                        </div>
                        <button
                            onClick={closeModal}
                            className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700"
                        >

                            <XCircleIcon className="size-8 text-blue-500">
                            </XCircleIcon>
                        </button>
                    </div>
                </div>

            )
            }




        </div >
    );
};

export default PatientsList;




