import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";

const HospitalStaffs = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [staffsPerPage, setStaffsPerPage] = useState(10);
  const [totalStaffs, setTotalStaffs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();

  // ✅ Fetch users with pagination
  const fetchTeamMembers = useCallback(async (page, limit, searchTerm) => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
      });

      const res = await fetch(
        `http://localhost:5000/api/v1/team-members?${params}`,
        { credentials: "include" }
      );

      if (!res.ok) throw new Error("Failed to load staff data");

      const data = await res.json();

      console.log("Staff members fetched:", data);

      // 🔥 Backend returns { staffMembers, pagination }
      setTeamMembers(data.staffMembers || []);
      setTotalStaffs(data.pagination?.totalStaffs || 0);
      setTotalPages(data.pagination?.totalPages || 1);
      setCurrentPage(data.pagination?.currentPage || 1);

    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to fetch staff members.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // 🔄 Run fetch when page, limit or search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTeamMembers(currentPage, staffsPerPage, search);
    }, 400);

    return () => clearTimeout(timer);
  }, [currentPage, staffsPerPage, search, fetchTeamMembers]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleStaffsPerPageChange = (newSize) => {
    setStaffsPerPage(parseInt(newSize));
    setCurrentPage(1);
  };

  const handleDelete = async (item) => {
    const confirm = await Swal.fire({
      title: "Are you sure?",
      text: "This staff member will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });

    if (!confirm.isConfirmed) return;

    try {
      await fetch(`http://localhost:5000/api/v1/team-members/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      fetchTeamMembers(currentPage, staffsPerPage, search);

      Swal.fire("Deleted!", "Staff member deleted successfully.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to delete staff member.", "error");
    }
  };

  const handleEdit = (item) => navigate(`/teamMembers/edit/${item.id}`);
  const handleView = (item) => navigate(`/teamMembers/view/${item.id}`);

  const columns = [
    {
      header: "#",
      render: (_, index) =>
        (currentPage - 1) * staffsPerPage + index + 1,
    },
    { header: "First Name", accessor: "first_name" },
    { header: "Last Name", accessor: "last_name" },
    { header: "Gender", accessor: "gender" },
    { header: "Phone", accessor: "phone" },
    { header: "Email", accessor: "email" },
    { header: "Role", accessor: "role_name" },
    { header: "Department", accessor: "department" },
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      <DataTable
        title="Hospital Staff Members"
        columns={columns}
        data={teamMembers}
        loading={loading}
        searchTerm={search}
        setSearchTerm={setSearch}
        onAddNew={() => navigate("/adduser")}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalStaffs}
        itemsPerPage={staffsPerPage}
        onItemsPerPageChange={handleStaffsPerPageChange}
        onPageChange={handlePageChange}
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
