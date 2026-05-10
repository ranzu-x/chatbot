import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";

const HospitalStaffs = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter State
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState(""); // ✅ New Role State

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [staffsPerPage, setStaffsPerPage] = useState(10);
  const [totalStaffs, setTotalStaffs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  const navigate = useNavigate();

  // ✅ Fetch users with pagination, search AND role
  const fetchTeamMembers = useCallback(async (page, limit, searchTerm, roleFilter) => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(roleFilter && { role: roleFilter }), // ✅ Send role to backend
      });

      const res = await fetch(
        `api/v1/team-members?${params}`,
        { credentials: "include" }
      );

      if (!res.ok) throw new Error("Failed to load staff data");

      const data = await res.json();

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

  // 🔄 Run fetch when page, limit, search OR role changes
  useEffect(() => {
    const timer = setTimeout(() => {
      // ✅ Pass selectedRole here
      fetchTeamMembers(currentPage, staffsPerPage, search, selectedRole);
    }, 400);

    return () => clearTimeout(timer);
  }, [currentPage, staffsPerPage, search, selectedRole, fetchTeamMembers]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleStaffsPerPageChange = (newSize) => {
    setStaffsPerPage(parseInt(newSize));
    setCurrentPage(1);
  };

  // ✅ Handle Role Dropdown Change
  const handleRoleChange = (e) => {
    setSelectedRole(e.target.value);
    setCurrentPage(1); // Reset to page 1 when filter changes
  };

  // ... (Keep handleDelete, handleEdit, handleView exactly as they were) ...
  const handleDelete = async (item) => {
     // ... your existing delete logic
  };
  const handleEdit = (item) => navigate(`/teamMembers/edit/${item.id}`);
  const handleView = (item) => navigate(`/teamMembers/view/${item.id}`);

  const columns = [
    {
      header: "#",
      render: (_, index) => (currentPage - 1) * staffsPerPage + index + 1,
    },
    { header: "First Name", accessor: "first_name" },
    { header: "Last Name", accessor: "last_name" },
    { header: "Gender", accessor: "gender" },
    { header: "Phone", accessor: "phone" },
    { header: "Role", accessor: "role_name" },
    { header: "Department", accessor: "department" },
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      
      {/* ✅ Add Filter Dropdown Area */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Staff Management</h2>
        
        {/* Role Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Filter by Role:</label>
          <select
            value={selectedRole}
            onChange={handleRoleChange}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Roles</option>
            <option value="doctor">Doctor</option>
            <option value="junior nurse">Junior Nurse</option>
            <option value="receptionist">Receptionist</option>
            <option value="pharmacist">Pharmacist</option>
            <option value="laboratorist">Laboratorist</option>
            <option value="accountant">Accountant</option>
          </select>
        </div>
      </div>

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