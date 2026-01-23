import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Printer, Save, Search, User } from 'lucide-react';
import axios from 'axios';
import { useSearchParams } from 'react-router';

const HospitalBillingSystem = () => {
  const [billType, setBillType] = useState('doctor');
  const [patientInfo, setPatientInfo] = useState({
    patientId: '',
    patientName: '',
    age: '',
    gender: '',
    phone: '',
    address: '',
    doctorName: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get("appointment_id");
  const [appointmentData, setAppointmentData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const printRef = useRef();

  useEffect(() => {
    if (appointmentId) {
      axios.get(`http://localhost:5000/api/v1/appointments/${appointmentId}`, { withCredentials: true })
        .then((res) => {
          setAppointmentData(res.data);
          setPatientInfo({
            patientId: res.data.patient_id || '',
            patientName: res.data.patient_name || '',
            age: res.data.patient_age || '',
            gender: res.data.patient_gender || '',
            phone: res.data.patient_phone || '',
            address: res.data.patient_address || '',
            doctorId: res.data.doctor_id || '',
            doctorName: res.data.doctor_name || '',
            doctorFee: res.data.appointment_fee || 0,
            date: res.data.appointment_date || new Date().toISOString().split('T')[0]
          });
          if (res.data.doctor_name && res.data.appointment_fee) {
            setDoctorItems([{
              id: 1,
              service: `Consultation - Dr. ${res.data.doctor_name}`,
              amount: res.data.appointment_fee
            }]);
          }
        })
        .catch((err) => {
          console.error("Error fetching appointment:", err);
          alert("Failed to load appointment details");
        });
    }
  }, [appointmentId]);

  const [doctorItems, setDoctorItems] = useState([
    { id: 1, service: '', amount: 0 }
  ]);

  const [labItems, setLabItems] = useState([
    { id: 1, testName: '', quantity: 1, rate: 0, amount: 0 }
  ]);

  const [medicineItems, setMedicineItems] = useState([
    { id: 1, medicineName: '', quantity: 1, rate: 0, discount: 0, amount: 0 }
  ]);

  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('percentage');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [remarks, setRemarks] = useState('');
  // const [invoiceNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);

  // Calculate subtotal based on bill type
  const calculateSubtotal = () => {
    if (billType === 'doctor') {
      return doctorItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    } else if (billType === 'lab') {
      return labItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    } else {
      return medicineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }
  };

  const subtotal = calculateSubtotal();
  const discountAmount = discountType === 'percentage'
    ? (subtotal * discount) / 100
    : discount;
  const tax = (subtotal - discountAmount) * 0.05;
  const grandTotal = subtotal - discountAmount + tax;

  // Doctor fee handlers
  const addDoctorItem = () => {
    setDoctorItems([...doctorItems, { id: Date.now(), service: '', amount: 0 }]);
  };

  const removeDoctorItem = (id) => {
    if (doctorItems.length > 1) {
      setDoctorItems(doctorItems.filter(item => item.id !== id));
    }
  };

  const updateDoctorItem = (id, field, value) => {
    setDoctorItems(doctorItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Lab test handlers
  const addLabItem = () => {
    setLabItems([...labItems, { id: Date.now(), testName: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeLabItem = (id) => {
    if (labItems.length > 1) {
      setLabItems(labItems.filter(item => item.id !== id));
    }
  };

  const updateLabItem = (id, field, value) => {
    setLabItems(labItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'rate') {
          updated.amount = Number(updated.quantity) * Number(updated.rate);
        }
        return updated;
      }
      return item;
    }));
  };

  // Medicine handlers
  const addMedicineItem = () => {
    setMedicineItems([...medicineItems, { id: Date.now(), medicineName: '', quantity: 1, rate: 0, discount: 0, amount: 0 }]);
  };

  const removeMedicineItem = (id) => {
    if (medicineItems.length > 1) {
      setMedicineItems(medicineItems.filter(item => item.id !== id));
    }
  };

  const updateMedicineItem = (id, field, value) => {
    setMedicineItems(medicineItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'rate' || field === 'discount') {
          const baseAmount = Number(updated.quantity) * Number(updated.rate);
          const itemDiscount = Number(updated.discount || 0);
          updated.amount = baseAmount - itemDiscount;
        }
        return updated;
      }
      return item;
    }));
  };

  /* ================= PRINT BILL ================= */
  // const handlePrint = () => {
  //   const printWindow = window.open('', '_blank');
  //   printWindow.document.write(`
  //     <!DOCTYPE html>
  //     <html>
  //     <head>
  //       <title>Hospital Invoice - ${invoiceNumber}</title>
  //       <style>
  //         @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          
  //         * {
  //           margin: 0;
  //           padding: 0;
  //           box-sizing: border-box;
  //           font-family: 'Inter', sans-serif;
  //         }
          
  //         body {
  //           background: white;
  //           color: #333;
  //           padding: 20px;
  //           max-width: 800px;
  //           margin: 0 auto;
  //         }
          
  //         .invoice-container {
  //           border: 2px solid #2563eb;
  //           border-radius: 12px;
  //           overflow: hidden;
  //           box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  //         }
          
  //         .invoice-header {
  //           background: linear-gradient(135deg, #2563eb, #1d4ed8);
  //           color: white;
  //           padding: 30px;
  //           text-align: center;
  //         }
          
  //         .hospital-name {
  //           font-size: 32px;
  //           font-weight: 700;
  //           margin-bottom: 8px;
  //           letter-spacing: 1px;
  //         }
          
  //         .hospital-tagline {
  //           font-size: 16px;
  //           opacity: 0.9;
  //           margin-bottom: 20px;
  //         }
          
  //         .invoice-title {
  //           font-size: 28px;
  //           font-weight: 600;
  //           margin-top: 15px;
  //           text-transform: uppercase;
  //           letter-spacing: 2px;
  //         }
          
  //         .invoice-info {
  //           background: #f8fafc;
  //           padding: 20px 30px;
  //           display: grid;
  //           grid-template-columns: 1fr 1fr;
  //           gap: 20px;
  //           border-bottom: 1px solid #e2e8f0;
  //         }
          
  //         .info-group h4 {
  //           color: #64748b;
  //           font-size: 12px;
  //           text-transform: uppercase;
  //           letter-spacing: 1px;
  //           margin-bottom: 8px;
  //         }
          
  //         .info-group p {
  //           font-size: 16px;
  //           font-weight: 500;
  //           color: #1e293b;
  //         }
          
  //         .patient-details {
  //           background: white;
  //           padding: 25px 30px;
  //           border-bottom: 2px solid #e2e8f0;
  //         }
          
  //         .section-title {
  //           color: #2563eb;
  //           font-size: 18px;
  //           font-weight: 600;
  //           margin-bottom: 15px;
  //           padding-bottom: 8px;
  //           border-bottom: 2px solid #2563eb;
  //           display: inline-block;
  //         }
          
  //         .patient-grid {
  //           display: grid;
  //           grid-template-columns: repeat(3, 1fr);
  //           gap: 15px;
  //         }
          
  //         .patient-item label {
  //           display: block;
  //           color: #64748b;
  //           font-size: 14px;
  //           margin-bottom: 5px;
  //         }
          
  //         .patient-item p {
  //           font-size: 15px;
  //           font-weight: 500;
  //           color: #1e293b;
  //         }
          
  //         .items-table {
  //           width: 100%;
  //           border-collapse: collapse;
  //           margin: 25px 0;
  //         }
          
  //         .items-table thead {
  //           background: #2563eb;
  //           color: white;
  //         }
          
  //         .items-table th {
  //           padding: 15px;
  //           text-align: left;
  //           font-weight: 600;
  //           text-transform: uppercase;
  //           font-size: 13px;
  //           letter-spacing: 0.5px;
  //         }
          
  //         .items-table tbody tr {
  //           border-bottom: 1px solid #e2e8f0;
  //         }
          
  //         .items-table tbody tr:nth-child(even) {
  //           background: #f8fafc;
  //         }
          
  //         .items-table td {
  //           padding: 12px 15px;
  //           font-size: 14px;
  //         }
          
  //         .items-table .text-right {
  //           text-align: right;
  //         }
          
  //         .items-table .text-center {
  //           text-align: center;
  //         }
          
  //         .amount {
  //           font-weight: 600;
  //           color: #1e293b;
  //         }
          
  //         .bill-summary {
  //           background: white;
  //           padding: 25px 30px;
  //           border-top: 2px solid #e2e8f0;
  //         }
          
  //         .summary-grid {
  //           display: grid;
  //           grid-template-columns: 1fr 1fr;
  //           gap: 20px;
  //           max-width: 500px;
  //           margin-left: auto;
  //         }
          
  //         .summary-row {
  //           display: flex;
  //           justify-content: space-between;
  //           padding: 10px 0;
  //           border-bottom: 1px dashed #cbd5e1;
  //         }
          
  //         .summary-label {
  //           color: #64748b;
  //           font-size: 15px;
  //         }
          
  //         .summary-value {
  //           font-weight: 500;
  //           color: #1e293b;
  //         }
          
  //         .total-row {
  //           border-top: 2px solid #2563eb;
  //           border-bottom: none;
  //           margin-top: 10px;
  //           padding-top: 15px;
  //         }
          
  //         .total-label {
  //           font-size: 18px;
  //           font-weight: 700;
  //           color: #2563eb;
  //         }
          
  //         .total-value {
  //           font-size: 24px;
  //           font-weight: 700;
  //           color: #2563eb;
  //         }
          
  //         .payment-info {
  //           margin-top: 20px;
  //           padding-top: 20px;
  //           border-top: 1px solid #e2e8f0;
  //         }
          
  //         .payment-grid {
  //           display: grid;
  //           grid-template-columns: repeat(2, 1fr);
  //           gap: 15px;
  //         }
          
  //         .footer {
  //           text-align: center;
  //           padding: 25px 30px;
  //           background: #f8fafc;
  //           border-top: 2px solid #e2e8f0;
  //           color: #64748b;
  //           font-size: 13px;
  //         }
          
  //         .thank-you {
  //           color: #2563eb;
  //           font-weight: 600;
  //           font-size: 16px;
  //           margin-bottom: 10px;
  //         }
          
  //         .hospital-contact {
  //           margin-top: 10px;
  //           font-size: 12px;
  //         }
          
  //         .watermark {
  //           position: fixed;
  //           top: 50%;
  //           left: 50%;
  //           transform: translate(-50%, -50%) rotate(-45deg);
  //           font-size: 80px;
  //           color: rgba(37, 99, 235, 0.1);
  //           font-weight: 900;
  //           z-index: -1;
  //           white-space: nowrap;
  //           pointer-events: none;
  //         }
          
  //         .bill-type-badge {
  //           display: inline-block;
  //           background: #dcfce7;
  //           color: #166534;
  //           padding: 5px 15px;
  //           border-radius: 20px;
  //           font-size: 14px;
  //           font-weight: 600;
  //           margin-left: 10px;
  //           text-transform: uppercase;
  //         }
          
  //         @media print {
  //           body {
  //             padding: 0;
  //           }
            
  //           .invoice-container {
  //             border: none;
  //             box-shadow: none;
  //           }
            
  //           .no-print {
  //             display: none;
  //           }
  //         }
  //       </style>
  //     </head>
  //     <body>
  //       <div class="watermark">${billType === 'doctor' ? 'MEDICAL CONSULTATION' : billType === 'lab' ? 'LABORATORY TEST' : 'PHARMACY'}</div>
        
  //       <div class="invoice-container">
  //         <div class="invoice-header">
  //           <div class="hospital-name">CITY HOSPITAL & DIAGNOSTICS</div>
  //           <div class="hospital-tagline">Quality Healthcare Services Since 1995</div>
  //           <div class="invoice-title">TAX INVOICE</div>
  //           <div style="margin-top: 10px; font-size: 14px; opacity: 0.9;">
  //             123 Medical Street, Health City, HC 12345 | Phone: (555) 123-4567
  //           </div>
  //         </div>
          
  //         <div class="invoice-info">
  //           <div class="info-group">
  //             <h4>Invoice Number</h4>
  //             <p>${invoiceNumber}</p>
  //             <h4 style="margin-top: 15px;">Date</h4>
  //             <p>${new Date(patientInfo.date).toLocaleDateString('en-US', {
  //     year: 'numeric',
  //     month: 'long',
  //     day: 'numeric'
  //   })}</p>
  //           </div>
  //           <div class="info-group">
  //             <h4>Bill Type</h4>
  //             <p>${billType.charAt(0).toUpperCase() + billType.slice(1)} Bill 
  //               <span class="bill-type-badge">${billType}</span>
  //             </p>
  //             <h4 style="margin-top: 15px;">Payment Mode</h4>
  //             <p>${paymentMode.charAt(0).toUpperCase() + paymentMode.slice(1)}</p>
  //           </div>
  //         </div>
          
  //         <div class="patient-details">
  //           <div class="section-title">Patient Information</div>
  //           <div class="patient-grid">
  //             <div class="patient-item">
  //               <label>Patient ID</label>
  //               <p>${patientInfo.patientId || 'N/A'}</p>
  //             </div>
  //             <div class="patient-item">
  //               <label>Patient Name</label>
  //               <p>${patientInfo.patientName || 'N/A'}</p>
  //             </div>
  //             <div class="patient-item">
  //               <label>Age / Gender</label>
  //               <p>${patientInfo.age || 'N/A'} / ${patientInfo.gender || 'N/A'}</p>
  //             </div>
  //             <div class="patient-item">
  //               <label>Contact Number</label>
  //               <p>${patientInfo.phone || 'N/A'}</p>
  //             </div>
  //             <div class="patient-item">
  //               <label>Doctor Name</label>
  //               <p>${patientInfo.doctorName || 'N/A'}</p>
  //             </div>
  //             <div class="patient-item">
  //               <label>Address</label>
  //               <p>${patientInfo.address || 'N/A'}</p>
  //             </div>
  //           </div>
  //         </div>
          
  //         <div style="padding: 25px 30px;">
  //           <div class="section-title">Bill Details</div>
  //           <table class="items-table">
  //             <thead>
  //               <tr>
  //                 ${billType === 'doctor' ? `
  //                   <th>Description</th>
  //                   <th style="text-align: right;">Amount ($)</th>
  //                 ` : billType === 'lab' ? `
  //                   <th>Test Name</th>
  //                   <th style="text-align: center;">Qty</th>
  //                   <th style="text-align: right;">Unit Price</th>
  //                   <th style="text-align: right;">Amount ($)</th>
  //                 ` : `
  //                   <th>Medicine Name</th>
  //                   <th style="text-align: center;">Qty</th>
  //                   <th style="text-align: right;">Unit Price</th>
  //                   <th style="text-align: right;">Discount</th>
  //                   <th style="text-align: right;">Amount ($)</th>
  //                 `}
  //               </tr>
  //             </thead>
  //             <tbody>
  //               ${billType === 'doctor' ? doctorItems.map(item => `
  //                 <tr>
  //                   <td>${item.service || 'Service'}</td>
  //                   <td class="text-right amount">$${Number(item.amount).toFixed(2)}</td>
  //                 </tr>
  //               `).join('') : ''}
                
  //               ${billType === 'lab' ? labItems.map(item => `
  //                 <tr>
  //                   <td>${item.testName || 'Test'}</td>
  //                   <td class="text-center">${item.quantity}</td>
  //                   <td class="text-right">$${Number(item.rate).toFixed(2)}</td>
  //                   <td class="text-right amount">$${Number(item.amount).toFixed(2)}</td>
  //                 </tr>
  //               `).join('') : ''}
                
  //               ${billType === 'medicine' ? medicineItems.map(item => `
  //                 <tr>
  //                   <td>${item.medicineName || 'Medicine'}</td>
  //                   <td class="text-center">${item.quantity}</td>
  //                   <td class="text-right">$${Number(item.rate).toFixed(2)}</td>
  //                   <td class="text-right">$${Number(item.discount).toFixed(2)}</td>
  //                   <td class="text-right amount">$${Number(item.amount).toFixed(2)}</td>
  //                 </tr>
  //               `).join('') : ''}
  //             </tbody>
  //           </table>
  //         </div>
          
  //         <div class="bill-summary">
  //           <div class="section-title">Bill Summary</div>
  //           <div class="summary-grid">
  //             <div class="summary-row">
  //               <span class="summary-label">Subtotal:</span>
  //               <span class="summary-value">$${subtotal.toFixed(2)}</span>
  //             </div>
  //             <div class="summary-row">
  //               <span class="summary-label">Discount (${discountType === 'percentage' ? `${discount}%` : 'Fixed'}):</span>
  //               <span class="summary-value" style="color: #dc2626;">-$${discountAmount.toFixed(2)}</span>
  //             </div>
  //             <div class="summary-row">
  //               <span class="summary-label">Tax (5%):</span>
  //               <span class="summary-value">$${tax.toFixed(2)}</span>
  //             </div>
  //             <div class="summary-row total-row">
  //               <span class="total-label">GRAND TOTAL:</span>
  //               <span class="total-value">$${grandTotal.toFixed(2)}</span>
  //             </div>
  //           </div>
            
  //           <div class="payment-info">
  //             <div class="section-title">Payment Information</div>
  //             <div class="payment-grid">
  //               <div class="patient-item">
  //                 <label>Payment Method</label>
  //                 <p>${paymentMode.charAt(0).toUpperCase() + paymentMode.slice(1)}</p>
  //               </div>
  //               <div class="patient-item">
  //                 <label>Amount Paid</label>
  //                 <p style="font-weight: 600; color: #059669;">$${grandTotal.toFixed(2)}</p>
  //               </div>
  //               <div class="patient-item">
  //                 <label>Payment Status</label>
  //                 <p style="color: #059669; font-weight: 600;">PAID</p>
  //               </div>
  //               <div class="patient-item">
  //                 <label>Due Date</label>
  //                 <p>${new Date().toLocaleDateString('en-US', {
  //     year: 'numeric',
  //     month: 'long',
  //     day: 'numeric'
  //   })}</p>
  //               </div>
  //             </div>
              
  //             ${remarks ? `
  //               <div style="margin-top: 20px;">
  //                 <div style="color: #64748b; font-size: 14px; margin-bottom: 5px;">Remarks:</div>
  //                 <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #2563eb;">
  //                   ${remarks}
  //                 </div>
  //               </div>
  //             ` : ''}
  //           </div>
  //         </div>
          
  //         <div class="footer">
  //           <div class="thank-you">Thank you for choosing City Hospital!</div>
  //           <div>This is a computer generated invoice and does not require a physical signature.</div>
  //           <div class="hospital-contact">
  //             Email: billing@cityhospital.com | Website: www.cityhospital.com<br>
  //             GSTIN: 27AABCC1234M1Z5 | License No: MH/2023/456789
  //           </div>
  //           <div style="margin-top: 15px; font-size: 11px; color: #94a3b8;">
  //             Please retain this copy for your records. Valid for 6 months from invoice date.
  //           </div>
  //         </div>
  //       </div>
        
  //       <script>
  //         window.onload = function() {
  //           window.print();
  //           setTimeout(function() {
  //             window.close();
  //           }, 1000);
  //         }
  //       </script>
  //     </body>
  //     </html>
  //   `);
  //   printWindow.document.close();
  // };

  const buildBillingItems = () => {
    if (billType === "doctor") {
      return doctorItems.map(item => ({
        service_name: item.service,
        quantity: 1,
        unit_price: Number(item.amount),
        total: Number(item.amount)
      }));
    }

    if (billType === "lab") {
      return labItems.map(item => ({
        service_name: item.testName,
        quantity: Number(item.quantity),
        unit_price: Number(item.rate),
        total: Number(item.amount)
      }));
    }

    return medicineItems.map(item => ({
      service_name: item.medicineName,
      quantity: Number(item.quantity),
      unit_price: Number(item.rate),
      total: Number(item.amount)
    }));
  };

  const handleSave = async () => {
    if (isSaving) return; // Prevent multiple submissions

    try {
      setIsSaving(true);
      const billData = {
        appointment_id: appointmentData?.id || null,
        patient_id: patientInfo.patientId,
        doctor_id: appointmentData?.doctor_id || null,
        bill_type: billType,
        subtotal,
        discount_amount: discountAmount,
        tax_amount: tax,
        grand_total: grandTotal,
        paid_amount: grandTotal,
        payment_method: paymentMode,
        payment_status: "paid",
        remarks,
        items: buildBillingItems()
      };

      const response = await axios.post(
        "http://localhost:5000/api/v1/bills",
        billData,
        { withCredentials: true }
      );

      alert("Bill saved successfully!");
      console.log(response.data);
    } catch (error) {
      console.error("❌ Error saving bill:", error);
      alert("Failed to save bill");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
        {/* Header */}
        <div className="border-b-2 border-blue-600 pb-4 mb-6">
          <h1 className="text-3xl font-bold text-blue-600">Hospital Billing System</h1>
          <p className="text-gray-600">Invoice & Billing Management</p>
        </div>

        {/* Bill Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Bill Type</label>
          <div className="flex gap-4">
            <button
              onClick={() => setBillType('doctor')}
              className={`px-6 py-2 rounded-lg font-medium transition ${billType === 'doctor'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
            >
              Doctor Fee
            </button>
            <button
              onClick={() => setBillType('lab')}
              className={`px-6 py-2 rounded-lg font-medium transition ${billType === 'lab'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
            >
              Lab Tests
            </button>
            <button
              onClick={() => setBillType('medicine')}
              className={`px-6 py-2 rounded-lg font-medium transition ${billType === 'medicine'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
            >
              Medicine
            </button>
          </div>
        </div>

        {/* Patient Information */}
        <div className="bg-blue-50 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <User size={20} />
            Patient Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Patient ID</label>
              <input
                type="text"
                value={patientInfo.patientId}
                onChange={(e) => setPatientInfo({ ...patientInfo, patientId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="PID-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name</label>
              <input
                type="text"
                value={patientInfo.patientName}
                onChange={(e) => setPatientInfo({ ...patientInfo, patientName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input
                type="number"
                value={patientInfo.age}
                onChange={(e) => setPatientInfo({ ...patientInfo, age: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select
                value={patientInfo.gender}
                onChange={(e) => setPatientInfo({ ...patientInfo, gender: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={patientInfo.phone}
                onChange={(e) => setPatientInfo({ ...patientInfo, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+1234567890"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={patientInfo.date}
                onChange={(e) => setPatientInfo({ ...patientInfo, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={patientInfo.address}
                onChange={(e) => setPatientInfo({ ...patientInfo, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="123 Main St, City, State"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Doctor Name</label>
              <input
                type="text"
                value={patientInfo.doctorName}
                onChange={(e) => setPatientInfo({ ...patientInfo, doctorName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Dr. Smith"
              />
            </div>
          </div>
        </div>

        {/* Items Section - Doctor Fee */}
        {billType === 'doctor' && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Doctor Services</h2>
              <button
                onClick={addDoctorItem}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Plus size={18} />
                Add Service
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Service Description</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount ($)</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {doctorItems.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.service}
                          onChange={(e) => updateDoctorItem(item.id, 'service', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Consultation, Surgery, etc."
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updateDoctorItem(item.id, 'amount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeDoctorItem(item.id)}
                          className="text-red-600 hover:text-red-800 transition"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Items Section - Lab Tests */}
        {billType === 'lab' && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Laboratory Tests</h2>
              <button
                onClick={addLabItem}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Plus size={18} />
                Add Test
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Test Name</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Quantity</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Rate ($)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount ($)</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {labItems.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.testName}
                          onChange={(e) => updateLabItem(item.id, 'testName', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="CBC, X-Ray, MRI, etc."
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLabItem(item.id, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500"
                          min="1"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateLabItem(item.id, 'rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        ${item.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeLabItem(item.id)}
                          className="text-red-600 hover:text-red-800 transition"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Items Section - Medicine */}
        {billType === 'medicine' && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Medicines</h2>
              <button
                onClick={addMedicineItem}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Plus size={18} />
                Add Medicine
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Medicine Name</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Quantity</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Rate ($)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Discount ($)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount ($)</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {medicineItems.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.medicineName}
                          onChange={(e) => updateMedicineItem(item.id, 'medicineName', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Paracetamol, Aspirin, etc."
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateMedicineItem(item.id, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500"
                          min="1"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateMedicineItem(item.id, 'rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e) => updateMedicineItem(item.id, 'discount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        ${item.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeMedicineItem(item.id)}
                          className="text-red-600 hover:text-red-800 transition"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Billing Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <div ref={printRef} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200 pb-4 mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">Invoice Preview</h3>
                    <p className="text-sm text-gray-600">Professional bill format</p>
                  </div>
                  <div className="text-right">
                    {/* <div className="text-lg font-semibold text-blue-600">{invoiceNumber}</div> */}
                    <div className="text-sm text-gray-500">Invoice #</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Bill From</h4>
                  <div className="text-sm">
                    <p className="font-semibold text-gray-900">City Hospital & Diagnostics</p>
                    <p className="text-gray-600">123 Medical Street</p>
                    <p className="text-gray-600">Health City, HC 12345</p>
                    <p className="text-gray-600">Phone: (555) 123-4567</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Bill To</h4>
                  <div className="text-sm">
                    <p className="font-semibold text-gray-900">{patientInfo.patientName || 'Patient Name'}</p>
                    <p className="text-gray-600">ID: {patientInfo.patientId || 'N/A'}</p>
                    <p className="text-gray-600">{patientInfo.address || 'Address'}</p>
                    <p className="text-gray-600">Phone: {patientInfo.phone || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {billType === 'doctor' && (
                        <>
                          <th className="py-3 px-4 text-left font-semibold text-gray-700">Service Description</th>
                          <th className="py-3 px-4 text-right font-semibold text-gray-700">Amount</th>
                        </>
                      )}
                      {billType === 'lab' && (
                        <>
                          <th className="py-3 px-4 text-left font-semibold text-gray-700">Test Name</th>
                          <th className="py-3 px-4 text-center font-semibold text-gray-700">Qty</th>
                          <th className="py-3 px-4 text-right font-semibold text-gray-700">Unit Price</th>
                          <th className="py-3 px-4 text-right font-semibold text-gray-700">Amount</th>
                        </>
                      )}
                      {billType === 'medicine' && (
                        <>
                          <th className="py-3 px-4 text-left font-semibold text-gray-700">Medicine Name</th>
                          <th className="py-3 px-4 text-center font-semibold text-gray-700">Qty</th>
                          <th className="py-3 px-4 text-right font-semibold text-gray-700">Unit Price</th>
                          <th className="py-3 px-4 text-right font-semibold text-gray-700">Discount</th>
                          <th className="py-3 px-4 text-right font-semibold text-gray-700">Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {billType === 'doctor' && doctorItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-4">{item.service || 'Consultation'}</td>
                        <td className="py-3 px-4 text-right font-medium">${Number(item.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                    {billType === 'lab' && labItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-4">{item.testName || 'Test'}</td>
                        <td className="py-3 px-4 text-center">{item.quantity}</td>
                        <td className="py-3 px-4 text-right">${Number(item.rate).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-medium">${Number(item.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                    {billType === 'medicine' && medicineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-4">{item.medicineName || 'Medicine'}</td>
                        <td className="py-3 px-4 text-center">{item.quantity}</td>
                        <td className="py-3 px-4 text-right">${Number(item.rate).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-red-600">-${Number(item.discount).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-medium">${Number(item.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 border-t border-gray-200 pt-6">
                <div className="max-w-xs ml-auto">
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Discount:</span>
                    <span className="font-medium text-red-600">-${discountAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Tax (5%):</span>
                    <span className="font-medium">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-3 mt-2 border-t border-gray-200">
                    <span className="font-bold text-lg text-gray-800">Total:</span>
                    <span className="font-bold text-xl text-blue-600">${grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 text-center text-sm text-gray-500">
                <p>Thank you for your business!</p>
                <p className="mt-1">This invoice is computer generated and valid without signature.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Payment Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="percentage">%</option>
                      <option value="fixed">$</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Credit/Debit Card</option>
                    <option value="insurance">Insurance</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows="3"
                    placeholder="Additional notes..."
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Items:</span>
                  <span className="font-medium">
                    {billType === 'doctor' ? doctorItems.length :
                      billType === 'lab' ? labItems.length :
                        medicineItems.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Bill Type:</span>
                  <span className="font-medium capitalize">{billType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Date:</span>
                  <span className="font-medium">{patientInfo.date}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition
    ${isSaving
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
          >
            <Save size={18} />
            {isSaving ? "Saving..." : "Save Bill"}
          </button>
          {/* <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition font-medium shadow-sm"
          >
            <Printer size={18} />
            Print Bill
          </button> */}
        </div>
      </div>
    </div>
  );
}

export default HospitalBillingSystem;