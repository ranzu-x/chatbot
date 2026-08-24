import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import { FaPrint } from "react-icons/fa";
import {
  fetchBilling,
  deleteBilling,
  updateBilling,
} from "../../services/billingService";

function BillingList() {
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [billsPerPage, setBillsPerPage] = useState(10);
  const [totalBills, setTotalBills] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();

  // ✅ Fetch bills with pagination + search (using billingService)
  const fetchBillings = useCallback(async (page, limit, searchTerm) => {
    setLoading(true);
    try {
      const data = await fetchBilling(page, limit, searchTerm);
      setBillings(data.bills);
      setTotalBills(data.pagination.totalBills);
      setTotalPages(data.pagination.totalPages);
      setCurrentPage(data.pagination.currentPage);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.response?.data?.message || "Failed to load billing data", "error");
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
      await deleteBilling(item.id);
      
      // ✅ Fix pagination bug: validate current page still exists
      const newTotal = totalBills - 1;
      const maxPossiblePage = Math.ceil(newTotal / billsPerPage);
      const pageToFetch = currentPage > maxPossiblePage && maxPossiblePage > 0 ? maxPossiblePage : currentPage;
      
      Swal.fire("Deleted!", "Bill deleted successfully", "success");
      fetchBillings(pageToFetch, billsPerPage, search);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.response?.data?.message || "Failed to delete bill", "error");
    }
  };

  const markPaid = async (id) => {
    try {
      await updateBilling(id, { status: "paid" });
      Swal.fire("Success", "Bill marked as paid!", "success");
      fetchBillings(currentPage, billsPerPage, search);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.response?.data?.message || "Failed to update bill status", "error");
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
    { header: "Invoice Number", accessor: "invoice_no" },
    {
      header: "Amount", accessor: "paid_amount",
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
            extraActions={[
              {
                key: "print",
                label: "Print",
                icon: <FaPrint className="text-gray-700" />,
                onClick: (bill) => navigate(`/billing/print/${bill.id}`),
              },
            ]}
          />
        )}
      />
    </div>
  );
}

export default BillingList;
