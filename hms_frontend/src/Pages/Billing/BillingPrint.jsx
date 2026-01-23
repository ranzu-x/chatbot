import { useEffect, useState } from "react";
import { useParams } from "react-router";
import axios from "axios";

const BillingPrint = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    axios
      .get(`http://localhost:5000/api/v1/bills/${id}`, { withCredentials: true })
      .then(res => setData(res.data));
  }, [id]);

  useEffect(() => {
    if (data) {
      setTimeout(() => window.print(), 500);
    }
  }, [data]);

  if (!data) return <p>Loading...</p>;

  const { bill, items, invoice_no } = data;

  return (
    <div className="p-6">
      <h1>Invoice: {invoice_no}</h1>
      <p>Patient: {bill.patient_name}</p>
      <p>Date: {bill.bill_date}</p>

      <table>
        {items.map(i => (
          <tr key={i.id}>
            <td>{i.service_name}</td>
            <td>{i.quantity}</td>
            <td>{i.total_price}</td>
          </tr>
        ))}
      </table>

      <h3>Total: {bill.grand_total}</h3>
    </div>
  );
};

export default BillingPrint;
