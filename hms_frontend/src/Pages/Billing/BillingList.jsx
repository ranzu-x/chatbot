import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import axios from "axios";

function BillingList() {
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [billsPerPage, setBillsPerPage] = useState(10);
  const [totalBills, setTotalBills] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();

  // ✅ Fetch bills with pagination + search
  const fetchBillings = useCallback(async (page, limit, searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await axios.get(
        `http://localhost:5000/api/v1/bills?${params}`,
        { withCredentials: true }
      );

      const data = response.data;
      setBillings(data.bills);
      setTotalBills(data.pagination.totalBills);
      setTotalPages(data.pagination.totalPages);
      setCurrentPage(data.pagination.currentPage);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to load billing data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Auto-fetch on page, limit, or search change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBillings(currentPage, billsPerPage, search);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentPage, billsPerPage, search, fetchBillings]);

  // ✅ Handlers
  const handlePageChange = (page) => setCurrentPage(page);

  const handleBillsPerPageChange = (newSize) => {
    setBillsPerPage(parseInt(newSize));
    setCurrentPage(1);
  };

  const handleView = (item) => navigate(`/billing/view/${item.id}`);
  const handleEdit = (item) => navigate(`/billing/edit/${item.id}`);

  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This bill will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    try {
      await axios.delete(`http://localhost:5000/api/v1/bills/${item.id}`, {
        withCredentials: true,
      });
      Swal.fire("Deleted!", "Bill deleted successfully", "success");
      fetchBillings(currentPage, billsPerPage, search);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to delete bill", "error");
    }
  };

  const markPaid = async (id) => {
    try {
      await axios.put(
        `http://localhost:5000/api/v1/bills/${id}`,
        { status: "paid" },
        { withCredentials: true }
      );
      Swal.fire("Success", "Bill marked as paid!", "success");
      fetchBillings(currentPage, billsPerPage, search);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to update bill status", "error");
    }
  };

  // ✅ Columns
  const columns = [
    {
      header: "#",
      render: (row, index) => (currentPage - 1) * billsPerPage + index + 1,
    },
    { header: "Patient", accessor: "patient_name" },
    { header: "Doctor", accessor: "doctor_name" },
    {
      header: "Amount",
      accessor: "paid_amount",
      render: (row) => `$${row.paid_amount || 0}`,
    },
    {
      header: "Status",
      render: (row) =>
        row.status === "unpaid" ? (
          <button
            onClick={() => markPaid(row.id)}
            className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
          >
            Mark Paid
          </button>
        ) : (
          <span className="text-green-600 font-semibold">Paid</span>
        ),
    },
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      <DataTable
        title="Billing"
        columns={columns}
        data={billings}
        loading={loading}
        searchTerm={search}
        setSearchTerm={setSearch}
        onAddNew={() => navigate("/billing/new")}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalBills}
        itemsPerPage={billsPerPage}
        onItemsPerPageChange={handleBillsPerPageChange}
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
}

export default BillingList;
