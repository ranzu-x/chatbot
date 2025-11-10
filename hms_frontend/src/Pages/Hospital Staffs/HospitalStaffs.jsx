import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
// import { useAuth } from "../../Provider/AuthContexProvider";

const HospitalStaffs = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  // const { user } = useAuth();

  // ✅ Fetch all team members
  const fetchTeamMembers = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:5000/api/v1/team-members", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load staff data");
      const data = await res.json();
      setTeamMembers(data);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to fetch team members.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  // ✅ Handle delete
  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This staff member will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#EF4444",
    });

    if (!result.isConfirmed) return;

    try {
      await fetch(`http://localhost:5000/api/v1/team-members/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setTeamMembers((prev) => prev.filter((p) => p.id !== item.id));
      Swal.fire("Deleted!", "Staff member deleted successfully.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to delete staff member.", "error");
    }
  };

  // ✅ Handle navigation
  const handleEdit = (item) => navigate(`/teamMembers/edit/${item.id}`);
  const handleView = (item) => navigate(`/teamMembers/view/${item.id}`);

  // ✅ DataTable columns
  const columns = [
    { header: "#", render: (_, index) => index + 1 },
    { header: "First Name", accessor: "first_name" },
    { header: "Last Name", accessor: "last_name" },
    { header: "Age", accessor: "age" },
    { header: "Gender", accessor: "gender" },
    { header: "Contact", accessor: "phone" },
    { header: "Email", accessor: "email" },
    { header: "Role", accessor: "role_name" },
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      <DataTable
        title="Hospital Staff Members"
        columns={columns}
        data={teamMembers}
        loading={loading}
        onAddNew={() => navigate("/adduser")}
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

export default HospitalStaffs;
