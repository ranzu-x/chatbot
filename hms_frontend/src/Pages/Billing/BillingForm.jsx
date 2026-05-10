import { useState, useEffect } from 'react';
import { Plus, Trash2, Printer, Save, Search, User } from 'lucide-react';
import axios from 'axios';
import { useSearchParams } from 'react-router';
import InvoiceLayout from './InvoiceLayout';
import { useAuth } from '../../Provider/AuthContexProvider';

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

  const { user } = useAuth();
  console.log("Logged in user:", user);


  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get("appointment_id");
  const [appointmentData, setAppointmentData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);


  useEffect(() => {
    if (appointmentId) {
      axios.get(`/api/v1/appointments/${appointmentId}`, { withCredentials: true })
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

  const dueAmount = Math.max(grandTotal - paidAmount, 0);

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

  const paymentStatus =
    dueAmount === 0
      ? "paid"
      : paidAmount === 0
        ? "unpaid"
        : "partial";

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
        paid_amount: paidAmount,
        due_amount: dueAmount,
        payment_method: paymentMode,
        payment_status: paymentStatus,
        remarks,
        items: buildBillingItems()
      };

      const response = await axios.post(
        "/api/v1/bills",
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


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Billing Summary starts */}
          <div className="lg:col-span-2">
            <InvoiceLayout
              hospitalInfo={user}
              billType={billType}
              patientInfo={patientInfo}
              appointmentInfo={appointmentData}
              doctorItems={doctorItems}
              labItems={labItems}
              medicineItems={medicineItems}
              subtotal={subtotal}
              discountAmount={discountAmount}
              tax={tax}
              grandTotal={grandTotal}
              paid={paidAmount}
            // invoiceNo={invoiceNumber}
            />

          </div>
          {/* Billing Summary Ends */}
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paid Amount
                  </label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) =>
                      setPaidAmount(
                        Math.min(Number(e.target.value), grandTotal)
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>

                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-600">Due Amount:</span>
                  <span className={`font-semibold ${dueAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                    ${dueAmount.toFixed(2)}
                  </span>
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
        </div>
      </div>
    </div>
  );
}

export default HospitalBillingSystem;