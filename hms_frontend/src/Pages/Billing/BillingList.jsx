import React, { useEffect, useState } from "react";
import axios from "axios";

const BillingList = () => {
  const [billings, setBillings] = useState([]);

 
//   const fetchBillings = async () => {
//     const res = await axios.get("/api/billing");
//     setBillings(res.data);
//   };

//    useEffect(() => {
//     fetchBillings();
//   }, []);


  const markPaid = async (id) => {
    await axios.put(`/api/billing/${id}`, { status: "paid" });
    fetchBillings();
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Billing</h2>
      <h2>Create Bill</h2>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th>ID</th>
            <th>Patient</th>
            <th>Doctor</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {billings.map((b) => (
            <tr key={b.id} className="text-center border-t">
              <td>{b.id}</td>
              <td>{b.patient_name}</td>
              <td>{b.doctor_name}</td>
              <td>${b.amount}</td>
              <td>{b.status}</td>
              <td>
                {b.status === "unpaid" && (
                  <button onClick={() => markPaid(b.id)} className="bg-green-500 text-white px-2 py-1 rounded">
                    Mark Paid
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BillingList;
