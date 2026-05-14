import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import api from "../../services/api";
import StaffViewModal from "../../Components/StaffViewModal";

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

  // Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  
  const navigate = useNavigate();

  // ✅ Fetch users with pagination, search AND role
const fetchTeamMembers = useCallback(async (page, limit, searchTerm, roleFilter) => {
  setLoading(true);

  try {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(searchTerm && { search: searchTerm }),
      ...(roleFilter && { role: roleFilter }),
    });

    const res = await api.get(
      `/api/v1/team-members?${params}`,
      {
        withCredentials: true,
      }
    );

    // ✅ Axios response is already JSON
    const data = res.data;

    setTeamMembers(data.staffMembers || []);
    setTotalStaffs(data.pagination?.totalStaffs || 0);
    setTotalPages(data.pagination?.totalPages || 1);
    setCurrentPage(data.pagination?.currentPage || 1);

  } catch (err) {
    console.error("Staff fetch error:", err);
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

  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: `You are about to delete ${item.first_name} ${item.last_name}. This action cannot be undone!`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/api/v1/users/${item.id}`, { withCredentials: true });
        Swal.fire("Deleted!", "Staff member has been deleted.", "success");
        fetchTeamMembers(currentPage, staffsPerPage, search, selectedRole);
      } catch (err) {
        console.error("Delete error:", err);
        Swal.fire("Error", "Failed to delete staff member.", "error");
      }
    }
  };

  const handleEdit = (item) => navigate(`/users/edit/${item.id}`);
  const handleView = (item) => {
    setSelectedStaffId(item.id);
    setIsViewModalOpen(true);
  };

  const columns = [
    {
      header: "#",
      render: (_, index) => (currentPage - 1) * staffsPerPage + index + 1,
    },
    { header: "First Name", accessor: "first_name" },
    { header: "Last Name", accessor: "last_name" },
    { header: "Email", accessor: "email" },
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
            <option value="senior nurse">Senior Nurse</option>
            <option value="receptionist">Receptionist</option>
            <option value="pharmacist">Pharmacist</option>
            <option value="laboratorist">Laboratorist</option>
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

      <StaffViewModal 
        isOpen={isViewModalOpen} 
        onClose={() => setIsViewModalOpen(false)} 
        staffId={selectedStaffId} 
      />
    </div>
  );
};

export default HospitalStaffs;