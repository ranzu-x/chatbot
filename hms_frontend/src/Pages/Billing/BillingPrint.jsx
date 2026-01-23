import { useEffect, useState } from "react";
import { useParams } from "react-router";
import axios from "axios";
import InvoiceLayout from './InvoiceLayout';

const BillingPrint = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    axios
      .get(`http://localhost:5000/api/v1/bills/${id}`, {
        withCredentials: true,
      })
      .then((res) => setData(res.data));
  }, [id]);

  // useEffect(() => {
  //   if (data) {
  //     setTimeout(() => window.print(), 500);
  //   }
  // }, [data]);

  if (!data) return <p className="p-6">Loading...</p>;

  const { bill, items, invoice_no } = data;

  // ================= NORMALIZE ITEMS =================
  const doctorItems = [];
  const labItems = [];
  const medicineItems = [];

  if (bill.bill_type === "doctor") {
    items.forEach((i) =>
      doctorItems.push({
        id: i.id,
        service: i.service_name,
        amount: i.total_price,
      })
    );
  }

  if (bill.bill_type === "lab") {
    items.forEach((i) =>
      labItems.push({
        id: i.id,
        testName: i.service_name,
        quantity: i.quantity,
        rate: i.unit_price,
        amount: i.total_price,
      })
    );
  }

  if (bill.bill_type === "medicine") {
    items.forEach((i) =>
      medicineItems.push({
        id: i.id,
        medicineName: i.service_name,
        quantity: i.quantity,
        rate: i.unit_price,
        discount: i.discount || 0,
        amount: i.total_price,
      })
    );
  }

  // ================= PATIENT INFO =================
  const patientInfo = {
    patientName: bill.patient_name,
    patientId: bill.patient_id,
    address: bill.patient_address,
    phone: bill.patient_phone,
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white">
      <InvoiceLayout
        billType={bill.bill_type}
        patientInfo={patientInfo}
        doctorItems={doctorItems}
        labItems={labItems}
        medicineItems={medicineItems}
        subtotal={Number(bill.total_amount)}
        discountAmount={Number(bill.discount_amount)}
        tax={Number(bill.tax_amount)}
        grandTotal={Number(bill.grand_total)}
        invoiceNo={invoice_no}
      />
    </div>
  );
};

export default BillingPrint;
