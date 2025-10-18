import React, { useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { useNavigate } from "react-router";
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";

const BillingList = () => {
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // ✅ Fetch all bills
  const fetchBillings = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/v1/bills", {
        withCredentials: true,
      });
      setBillings(res.data);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to load billing data", "error");
    } finally {
      setLoading(false);
    }
  };
  console.log(billings)

  useEffect(() => {
    fetchBillings();
  }, []);

  // ✅ Mark bill as paid
  const markPaid = async (id) => {
    try {
      await axios.put(`http://localhost:5000/api/v1/bills/${id}`, { status: "paid" }, { withCredentials: true });
      Swal.fire("Success", "Bill marked as paid!", "success");
      fetchBillings();
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to update bill status", "error");
    }
  };

  // ✅ Table actions
  const handleView = (item) => navigate(`/billing/view/${item.id}`);
  const handleEdit = (item) => navigate(`/billing/edit/${item.id}`);
  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This bill will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
    });

    if (!result.isConfirmed) return;

    try {
      await axios.delete(`http://localhost:5000/api/v1/bills/${item.id}`, { withCredentials: true });
      Swal.fire("Deleted!", "Bill deleted successfully", "success");
      fetchBillings();
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to delete bill", "error");
    }
  };

  // ✅ DataTable columns
  const columns = [
    { header: "#", render: (row, index) => index + 1 },
    { header: "Patient", accessor: "patient_name" },
    { header: "Doctor", accessor: "doctor_name" },
    { header: "Amount", accessor: "paid_amount", render: (row) => `$${row.paid_amount}` },
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
        onAddNew={() => navigate("/billing/new")}
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

export default BillingList;
