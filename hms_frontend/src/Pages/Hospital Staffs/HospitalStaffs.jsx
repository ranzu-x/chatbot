import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import { useAuth } from "../../Provider/AuthContexProvider";

const HospitalStaffs = () => {
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const navigate = useNavigate();
    const { user } = useAuth();

    const fetchTeamMembers = async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:5000/api/v1/team-members", {
                credentials: "include",
            });
            const data = await res.json();
            setTeamMembers(data);
        } catch (err) {
            console.error(err);
            Swal.fire("Error", "Failed to fetch team members.", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTeamMembers();
    }, []);

    const handleDelete = async (id) => {
        Swal.fire({
            title: "Are you sure?",
            text: "This will permanently delete the record.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#EF4444",
        }).then(async (result) => {
            if (result.isConfirmed) {
                await fetch(`http://localhost:5000/api/v1/team-members/${id}`, {
                    method: "DELETE",
                });
                setTeamMembers((prev) => prev.filter((p) => p.id !== id));
            }
        });
    };

    const handleEdit = (id) => navigate(`/teamMembers/edit/${id}`);
    const handleView = (id) => navigate(`/teamMembers/view/${id}`);

    const columns = [
        { header: "#", render: (item, index) => index + 1 },
        { header: "First Name", accessor: "first_name" },
        { header: "Last Name", accessor: "last_name" },
        { header: "Age", accessor: "age" },
        { header: "Gender", accessor: "gender" },
        { header: "Contact", accessor: "phone" },
    ];

    const totalPages = Math.ceil(teamMembers.length / itemsPerPage);
    const currentData = teamMembers.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Team Members</h2>
                
            </div>

            <DataTable
                title="team members"
                columns={columns}
                data={currentData}
                loading={loading}
                onAddNew={() => navigate("/adduser")}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

        </div>
    );
};

export default HospitalStaffs;
