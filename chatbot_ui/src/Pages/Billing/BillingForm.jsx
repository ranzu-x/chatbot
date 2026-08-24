import { useState, useEffect } from 'react';
import { Plus, Trash2, Printer, Save, Search, User } from 'lucide-react';
import api from '../../services/api';
import { useSearchParams, useParams } from 'react-router';
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
  const { id } = useParams();
  const appointmentId = searchParams.get("appointment_id");
  const [appointmentData, setAppointmentData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);

  // Master data for autocomplete
  const [masterServices, setMasterServices] = useState([]);
  const [masterMedicines, setMasterMedicines] = useState([]);
  const [masterPatients, setMasterPatients] = useState([]);
  const [masterDoctors, setMasterDoctors] = useState([]);
  const [activeSearch, setActiveSearch] = useState({ type: null, id: null, query: '' });


  useEffect(() => {
    // Fetch master services
    api.get('/api/v1/services')
      .then(res => {
        const consultationTerms = ['consultation', 'report review'];
        const filtered = res.data.filter(s =>
          !consultationTerms.some(term => (s.service_name || '').toLowerCase().includes(term))
        );
        setMasterServices(filtered);
      })
      .catch(err => console.error("Error fetching master services:", err));

    // Fetch master medicines
    api.get('/api/v1/medicines')
      .then(res => setMasterMedicines(res.data))
      .catch(err => console.error("Error fetching master medicines:", err));

    // Fetch master patients
    api.get('/api/v1/patients')
      .then(res => setMasterPatients(res.data.patients || []))
      .catch(err => console.error("Error fetching patients:", err));

    // Fetch master doctors
    api.get('/api/v1/doctors')
      .then(res => setMasterDoctors(res.data || []))
      .catch(err => console.error("Error fetching doctors:", err));

    if (id) {
      // Fetch existing bill for editing
      api.get(`/api/v1/bills/${id}`)
        .then((res) => {
          const { bill, items, invoice_no } = res.data;
          setBillType(bill.bill_type);
          setPatientInfo({
            patientId: bill.patient_id || '',
            patientName: bill.patient_name || '',
            age: bill.age || '',
            gender: bill.gender || '',
            phone: bill.phone || '',
            address: bill.address || '',
            doctorName: bill.doctor_name || '',
            date: bill.bill_date ? new Date(bill.bill_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          });
          setPaidAmount(Number(bill.paid_amount) || 0);
          setDiscount(Number(bill.discount_amount) || 0);
          setDiscountType('fixed');
          setPaymentMode(bill.payment_method || 'cash');
          setRemarks(bill.remarks || '');

          // Populate items
          if (bill.bill_type === 'doctor') {
            setDoctorItems(items.map(i => ({ id: i.id, service: i.service_name, amount: i.total_price })));
          } else if (bill.bill_type === 'lab') {
            setLabItems(items.map(i => ({ id: i.id, testName: i.service_name, quantity: i.quantity, rate: i.unit_price, amount: i.total_price })));
          } else if (bill.bill_type === 'medicine') {
            setMedicineItems(items.map(i => ({ id: i.id, medicineName: i.service_name, quantity: i.quantity, rate: i.unit_price, discount: i.discount || 0, amount: i.total_price })));
          }
        })
        .catch(err => console.error("Error fetching bill:", err));
    } else if (appointmentId) {
      api.get(`/api/v1/appointments/${appointmentId}`, { withCredentials: true })
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
  }, [id, appointmentId]);

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
  const [invoiceNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);

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
    setDoctorItems(prev => prev.map(item =>
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
    setLabItems(prev => prev.map(item => {
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
    setMedicineItems(prev => prev.map(item => {
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
    if (isSaving) return;

    try {
      setIsSaving(true);

      const items = buildBillingItems();

      if (!items || items.length === 0) {
        alert("Please add billing items");
        return;
      }

      const billData = {
        appointment_id: appointmentData?.id || null,
        patient_id: appointmentData?.patient_id || null, // ✅ FIXED
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
        items
      };

      const response = id
        ? await api.put(`/api/v1/bills/${id}`, billData)
        : await api.post("/api/v1/bills", billData);

      alert(id ? "Bill updated successfully!" : "Bill saved successfully!");
      console.log(response.data);

    } catch (error) {
      console.error(
        "❌ Error saving bill:",
        error.response?.data || error.message
      );

      alert(
        error.response?.data?.message ||
        "Failed to save bill"
      );
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Patient ID</label>
              <input
                type="text"
                value={patientInfo.patientId}
                onChange={(e) => setPatientInfo({ ...patientInfo, patientId: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="PID-001"
              />
            </div>
            <div className="relative overflow-visible">
              <label className="block text-sm font-bold text-slate-700 mb-2">Patient Name</label>
              <div className="relative">
                <input
                  type="text"
                  value={patientInfo.patientName}
                  onChange={(e) => {
                    setPatientInfo({ ...patientInfo, patientName: e.target.value });
                    setActiveSearch({ type: 'patient', id: 'info', query: e.target.value });
                  }}
                  onFocus={() => setActiveSearch({ type: 'patient', id: 'info', query: patientInfo.patientName })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Search patient..."
                />
                {activeSearch.type === 'patient' && activeSearch.query && (
                  <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-64 overflow-y-auto ring-1 ring-black ring-opacity-5">
                    {masterPatients
                      .filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(activeSearch.query.toLowerCase()))
                      .map(p => (
                        <div
                          key={p.id}
                          className="px-5 py-3 hover:bg-blue-600 hover:text-white cursor-pointer border-b border-slate-50 last:border-0 group transition-colors"
                          onClick={() => {
                            setPatientInfo({
                              ...patientInfo,
                              patientId: p.id,
                              patientName: `${p.first_name} ${p.last_name}`,
                              age: p.age || '',
                              gender: p.gender || '',
                              phone: p.phone || '',
                              address: p.address || '',
                            });
                            setActiveSearch({ type: null, id: null, query: '' });
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-sm">{p.first_name} {p.last_name}</span>
                            <span className="text-[10px] opacity-70">PID: {p.id} | {p.phone}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Age</label>
              <input
                type="number"
                value={patientInfo.age}
                onChange={(e) => setPatientInfo({ ...patientInfo, age: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Gender</label>
              <select
                value={patientInfo.gender}
                onChange={(e) => setPatientInfo({ ...patientInfo, gender: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Phone</label>
              <input
                type="tel"
                value={patientInfo.phone}
                onChange={(e) => setPatientInfo({ ...patientInfo, phone: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="+1234567890"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
              <input
                type="date"
                value={patientInfo.date}
                onChange={(e) => setPatientInfo({ ...patientInfo, date: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Address</label>
              <input
                type="text"
                value={patientInfo.address}
                onChange={(e) => setPatientInfo({ ...patientInfo, address: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="123 Main St, City, State"
              />
            </div>
            <div className="relative overflow-visible">
              <label className="block text-sm font-bold text-slate-700 mb-2">Doctor Name</label>
              <div className="relative">
                <input
                  type="text"
                  value={patientInfo.doctorName}
                  onChange={(e) => {
                    setPatientInfo({ ...patientInfo, doctorName: e.target.value });
                    setActiveSearch({ type: 'doctor', id: 'info', query: e.target.value });
                  }}
                  onFocus={() => setActiveSearch({ type: 'doctor', id: 'info', query: patientInfo.doctorName })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Search doctor..."
                />
                {activeSearch.type === 'doctor' && activeSearch.query && (
                  <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-64 overflow-y-auto ring-1 ring-black ring-opacity-5">
                    {masterDoctors
                      .filter(d => `${d.first_name} ${d.last_name}`.toLowerCase().includes(activeSearch.query.toLowerCase()))
                      .map(d => (
                        <div
                          key={d.id}
                          className="px-5 py-3 hover:bg-blue-600 hover:text-white cursor-pointer border-b border-slate-50 last:border-0 group transition-colors"
                          onClick={() => {
                            setPatientInfo({
                              ...patientInfo,
                              doctorName: `Dr. ${d.first_name} ${d.last_name}`,
                              doctorId: d.id
                            });
                            setActiveSearch({ type: null, id: null, query: '' });
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-sm">Dr. {d.first_name} {d.last_name}</span>
                            <span className="text-[10px] opacity-70">{d.specialization} | {d.department}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
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
            <div className="overflow-visible">
              <table className="w-full border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Test Name</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Quantity</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Rate ($)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount ($)</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {labItems.map((item) => (
                    <tr key={item.id} className={`transition-colors ${activeSearch.id === item.id ? 'z-50 relative bg-blue-50/30' : 'z-0'}`}>
                      <td className="px-4 py-3 relative overflow-visible">
                        <div className="relative">
                          <input
                            type="text"
                            value={item.testName}
                            onChange={(e) => {
                              updateLabItem(item.id, 'testName', e.target.value);
                              setActiveSearch({ type: 'lab', id: item.id, query: e.target.value });
                            }}
                            onFocus={() => setActiveSearch({ type: 'lab', id: item.id, query: item.testName })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            placeholder="Search test..."
                          />
                          {/* Autocomplete Dropdown */}
                          {activeSearch.type === 'lab' && activeSearch.id === item.id && activeSearch.query && (
                            <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-60 overflow-y-auto ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in-95 duration-100">
                              {masterServices
                                .filter(s => s.service_name.toLowerCase().includes(activeSearch.query.toLowerCase()))
                                .map(s => (
                                  <div
                                    key={s.id}
                                    className="px-4 py-3 hover:bg-blue-600 hover:text-white cursor-pointer border-b border-gray-50 last:border-0 group transition-colors"
                                    onClick={() => {
                                      updateLabItem(item.id, 'testName', s.service_name);
                                      updateLabItem(item.id, 'rate', s.price);
                                      setActiveSearch({ type: null, id: null, query: '' });
                                    }}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="font-semibold text-sm">{s.service_name}</span>
                                      <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        ${parseFloat(s.price).toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              {masterServices.filter(s => s.service_name.toLowerCase().includes(activeSearch.query.toLowerCase())).length === 0 && (
                                <div className="px-4 py-3 text-sm text-gray-500 italic text-center">
                                  No matching tests found
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLabItem(item.id, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 bg-white"
                          min="1"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateLabItem(item.id, 'rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">
                        ${Number(item.amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeLabItem(item.id)}
                          className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors"
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
            <div className="overflow-visible">
              <table className="w-full border-collapse">
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
                <tbody className="divide-y divide-gray-200">
                  {medicineItems.map((item) => (
                    <tr key={item.id} className={`transition-colors ${activeSearch.id === item.id ? 'z-50 relative bg-blue-50/30' : 'z-0'}`}>
                      <td className="px-4 py-3 relative overflow-visible">
                        <div className="relative">
                          <input
                            type="text"
                            value={item.medicineName}
                            onChange={(e) => {
                              updateMedicineItem(item.id, 'medicineName', e.target.value);
                              setActiveSearch({ type: 'medicine', id: item.id, query: e.target.value });
                            }}
                            onFocus={() => setActiveSearch({ type: 'medicine', id: item.id, query: item.medicineName })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            placeholder="Search medicine..."
                          />
                          {/* Autocomplete Dropdown */}
                          {activeSearch.type === 'medicine' && activeSearch.id === item.id && activeSearch.query && (
                            <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-60 overflow-y-auto ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in-95 duration-100">
                              {masterMedicines
                                .filter(m => (m.name || '').toLowerCase().includes(activeSearch.query.toLowerCase()))
                                .map(m => (
                                  <div
                                    key={m.id}
                                    className="px-4 py-3 hover:bg-blue-600 hover:text-white cursor-pointer border-b border-gray-50 last:border-0 group transition-colors"
                                    onClick={() => {
                                      updateMedicineItem(item.id, 'medicineName', m.name);
                                      updateMedicineItem(item.id, 'rate', m.price || 0);
                                      setActiveSearch({ type: null, id: null, query: '' });
                                    }}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="font-semibold text-sm">{m.name}</span>
                                      <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        ${parseFloat(m.price || 0).toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              {masterMedicines.filter(m => (m.name || '').toLowerCase().includes(activeSearch.query.toLowerCase())).length === 0 && (
                                <div className="px-4 py-3 text-sm text-gray-500 italic text-center">
                                  No matching medicines found
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateMedicineItem(item.id, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 bg-white"
                          min="1"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateMedicineItem(item.id, 'rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.discount}
                          onChange={(e) => updateMedicineItem(item.id, 'discount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">
                        ${Number(item.amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeMedicineItem(item.id)}
                          className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors"
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
              invoiceNo={invoiceNumber}
              showActions={true}
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