import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FaTrash, FaEdit, FaPlus, FaCapsules } from 'react-icons/fa';

const AddPrescription = () => {
  const [doctorDetails, setDoctorDetails] = useState({
    name: '',
    clinic: '',
    contact: '',
  });

  const [patientDetails, setPatientDetails] = useState({
    name: '',
    age: '',
    gender: 'Male',
    date: new Date().toISOString().slice(0, 10),
  });

  const [medicationOptions, setMedicationOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [prescribedMedicines, setPrescribedMedicines] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const initialPrescriptionState = {
    medicationId: '',
    medicationName: '',
    dosage: '',
    doseDuration: '',
    time: 'After Meal',
    doseInterval: 'Once a day',
    comment: '',
  };

  const [currentPrescription, setCurrentPrescription] = useState(initialPrescriptionState);

  // Patient search state
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const fetchDoctorAndMedicines = async () => {
      try {
        const doctorId = 1;
        const [doctorRes, medicineRes] = await Promise.all([
          axios.get(`/api/v1/doctors/${doctorId}`),
          axios.get(`/api/v1/medicines`)
        ]);
        setDoctorDetails(doctorRes.data);
        setMedicationOptions(medicineRes.data);
        setIsLoading(false);
      } catch (error) {
        console.error('Data fetch error:', error);
      }
    };

    fetchDoctorAndMedicines();
  }, []);

  // Patient search function
  const handlePatientSearch = async (query) => {
    setPatientQuery(query);
    if (!query) {
      setPatientResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await axios.get(`/api/v1/patients/search?q=${query}`);
      setPatientResults(res.data);
    } catch (error) {
      console.error('Patient search error:', error);
    } finally {
      setSearching(false);
    }
  };

  // Select patient from search results
  const handleSelectPatient = (patient) => {
    setPatientDetails({
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      date: new Date().toISOString().slice(0, 10),
    });
    setPatientQuery('');
    setPatientResults([]);
  };

  /* ======================
     HANDLERS (UNCHANGED)
  ====================== */
  const handleDetailsChange = (e, setter) => {
    const { name, value } = e.target;
    setter((prev) => ({ ...prev, [name]: value }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentPrescription((prev) => ({ ...prev, [name]: value }));
  };

  const handleMedicationSelect = (e) => {
    const medicationId = e.target.value;
    const medicationName = e.target.options[e.target.selectedIndex].text;
    setCurrentPrescription((prev) => ({
      ...prev,
      medicationId,
      medicationName,
    }));
  };

  const handleAddOrUpdateMedicine = () => {
    if (!currentPrescription.medicationId || !currentPrescription.dosage) {
      alert('Please select a medication and enter a dosage.');
      return;
    }

    if (editingId !== null) {
      setPrescribedMedicines((prevMedicines) =>
        prevMedicines.map((med) =>
          med.id === editingId
            ? { ...currentPrescription, id: editingId }
            : med
        )
      );
    } else {
      setPrescribedMedicines((prev) => [
        ...prev,
        { ...currentPrescription, id: Date.now() },
      ]);
    }

    setCurrentPrescription(initialPrescriptionState);
    setEditingId(null);
  };

  const handleEdit = (id) => {
    const medicineToEdit = prescribedMedicines.find((med) => med.id === id);
    if (medicineToEdit) {
      setCurrentPrescription(medicineToEdit);
      setEditingId(id);
    }
  };

  const handleDelete = (id) => {
    setPrescribedMedicines((prevMedicines) =>
      prevMedicines.filter((med) => med.id !== id)
    );
  };

  const cancelEdit = () => {
    setCurrentPrescription(initialPrescriptionState);
    setEditingId(null);
  };

  /* ======================
     UI (Added Patient Search)
  ====================== */
  return (
    <div className="bg-gray-100 min-h-screen font-sans">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">

        <header className="mb-10">
          <h1 className="text-4xl font-bold text-gray-800">Create Prescription</h1>
          <p className="text-md text-gray-500 mt-2">
            A streamlined interface for managing patient prescriptions.
          </p>
        </header>

        {/* Patient and Doctor Details Form */}
        <div className="bg-white p-6 rounded-2xl  mb-8 transition-all duration-300">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b-2 border-gray-100 pb-3">
            Patient &amp; Doctor Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {/* Patient Search Input */}
            <h3 className="md:col-span-2 text-lg font-semibold text-blue-600">Patient Information</h3>
            <div className="relative md:col-span-2">
              <label htmlFor="patientSearch" className="block text-sm font-medium text-gray-600 mb-1">Search Patient</label>
              <input
                type="text"
                id="patientSearch"
                name="patientSearch"
                value={patientQuery}
                onChange={(e) => handlePatientSearch(e.target.value)}
                placeholder="Enter patient name..."
                className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all duration-200"
              />
              {searching && <p className="text-gray-500 text-sm mt-1">Searching...</p>}
              {patientResults.length > 0 && (
                <ul className="absolute z-50 bg-white border border-gray-200 mt-1 w-full max-h-48 overflow-y-auto rounded-lg shadow-md">
                  {patientResults.map((patient) => (
                    <li
                      key={patient.id}
                      className="px-4 py-2 hover:bg-blue-100 cursor-pointer"
                      onClick={() => handleSelectPatient(patient)}
                    >
                      {patient.name} - Age: {patient.age}, Gender: {patient.gender}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Existing patient details inputs */}
            <div>
              <label htmlFor="patientName" className="block text-sm font-medium text-gray-600 mb-1">Patient Name</label>
              <input type="text" id="patientName" name="name" value={patientDetails.name} onChange={(e) => handleDetailsChange(e, setPatientDetails)} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all duration-200"/>
            </div>
            <div>
              <label htmlFor="age" className="block text-sm font-medium text-gray-600 mb-1">Age</label>
              <input type="number" id="age" name="age" value={patientDetails.age} onChange={(e) => handleDetailsChange(e, setPatientDetails)} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all duration-200"/>
            </div>
            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-600 mb-1">Gender</label>
              <select id="gender" name="gender" value={patientDetails.gender} onChange={(e) => handleDetailsChange(e, setPatientDetails)} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-white">
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-600 mb-1">Date</label>
              <input type="date" id="date" name="date" value={patientDetails.date} onChange={(e) => handleDetailsChange(e, setPatientDetails)} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all duration-200"/>
            </div>

            {/* Doctor Details */}
            <h3 className="md:col-span-2 mt-4 text-lg font-semibold text-blue-600">Doctor Information</h3>
            <div>
              <label htmlFor="doctorName" className="block text-sm font-medium text-gray-600 mb-1">Doctor Name</label>
              <input type="text" id="doctorName" name="name" value={doctorDetails.name} onChange={(e) => handleDetailsChange(e, setDoctorDetails)} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all duration-200"/>
            </div>
            <div>
              <label htmlFor="clinic" className="block text-sm font-medium text-gray-600 mb-1">Clinic / Hospital</label>
              <input type="text" id="clinic" name="clinic" value={doctorDetails.clinic} onChange={(e) => handleDetailsChange(e, setDoctorDetails)} className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all duration-200"/>
            </div>
          </div>
        </div>

             {/* Medication Entry Form Card */}
             <div className="bg-white p-6 rounded-2xl mb-8 transition-all duration-300">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b-2 border-gray-100 pb-3 flex items-center gap-3">
                 <FaCapsules className="text-blue-500"/>
                 {editingId ? 'Edit Medicine' : 'Add New Medicine'}
               </h2>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                 <div className="lg:col-span-1">
                   <label htmlFor="medicationId" className="block text-sm font-medium text-gray-600 mb-1">Medication</label>
                   <select id="medicationId" name="medicationId" value={currentPrescription.medicationId} onChange={handleMedicationSelect} className="w-full p-2.5 border border-gray-200 rounded-lg  focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-white" disabled={isLoading}>
                     <option value="">{isLoading ? 'Loading...' : 'Select a medication'}</option>
                     {medicationOptions.map((med) => (<option key={med.id} value={med.id}>{med.name}</option>))}
                   </select>
                 </div>
                 <div>
                   <label htmlFor="dosage" className="block text-sm font-medium text-gray-600 mb-1">Dosage</label>
                   <input type="text" id="dosage" name="dosage" value={currentPrescription.dosage} onChange={handleInputChange} className="w-full p-2.5 border border-gray-200 rounded-lg  focus:ring-2 focus:ring-blue-500 transition-all duration-200" placeholder="e.g., 1 tablet"/>
                 </div>
                 <div>
                   <label htmlFor="doseDuration" className="block text-sm font-medium text-gray-600 mb-1">Dose Duration</label>
                   <input type="text" id="doseDuration" name="doseDuration" value={currentPrescription.doseDuration} onChange={handleInputChange} className="w-full p-2.5 border border-gray-200 rounded-lg  focus:ring-2 focus:ring-blue-500 transition-all duration-200" placeholder="e.g., 7 days"/>
                 </div>
                 <div>
                   <label htmlFor="time" className="block text-sm font-medium text-gray-600 mb-1">Time</label>
                   <select id="time" name="time" value={currentPrescription.time} onChange={handleInputChange} className="w-full p-2.5 border border-gray-200 rounded-lg  focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-white">
                     <option>After Meal</option>
                     <option>Before Meal</option>
                     <option>With Meal</option>
                   </select>
                 </div>
                 <div>
                   <label htmlFor="doseInterval" className="block text-sm font-medium text-gray-600 mb-1">Dose Interval</label>
                   <select id="doseInterval" name="doseInterval" value={currentPrescription.doseInterval} onChange={handleInputChange} className="w-full p-2.5 border border-gray-200 rounded-lg  focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-white">
                     <option>Once a day</option>
                     <option>Twice a day</option>
                     <option>Three times a day</option>
                     <option>As needed</option>
                   </select>
                 </div>
                 <div className="md:col-span-2 lg:col-span-1">
                   <label htmlFor="comment" className="block text-sm font-medium text-gray-600 mb-1">Comment</label>
                   <input type="text" id="comment" name="comment" value={currentPrescription.comment} onChange={handleInputChange} className="w-full p-2.5 border border-gray-200 rounded-lg  focus:ring-2 focus:ring-blue-500 transition-all duration-200" placeholder="Optional notes"/>
                 </div>
               </div>
               <div className="mt-8 flex justify-end items-center gap-4">
                 {editingId && (
                   <button onClick={cancelEdit} className="px-6 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-all duration-200 transform hover:scale-105">
                     Cancel
                   </button>
                 )}
                 <button onClick={handleAddOrUpdateMedicine} className={`px-6 py-2.5 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-75 transition-all duration-200 transform hover:scale-105 flex items-center gap-2 ${editingId ? 'bg-green-500 hover:bg-green-600 focus:ring-green-500' : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'}`}>
                   {editingId ? <FaEdit/> : <FaPlus/>}
                   {editingId ? 'Update Medicine' : 'Add Medicine'}
                 </button>
               </div>
             </div>
     
             {/* --- Prescription Header & List --- */}
             <div className="bg-white rounded-2xl transition-all duration-300">
                 <div className="p-6 border-b-2 border-dashed border-gray-200">
                     <h2 className="text-3xl font-bold text-center text-gray-800 mb-4 tracking-wider">PRESCRIPTION</h2>
                     <div className="flex justify-between items-start text-sm text-gray-700">
                         {/* Doctor Details */}
                         <div>
                             <p className="font-bold text-lg text-gray-900">{doctorDetails.name}</p>
                             <p className="text-gray-600">{doctorDetails.clinic}</p>
                             <p className="text-gray-600">{doctorDetails.contact}</p>
                         </div>
                         {/* Patient Details */}
                         <div className="text-right">
                             <p><span className="font-semibold text-gray-800">Patient:</span> {patientDetails.name || 'N/A'}</p>
                             <p><span className="font-semibold text-gray-800">Age:</span> {patientDetails.age || 'N/A'}, <span className="font-semibold">Gender:</span> {patientDetails.gender}</p>
                             <p><span className="font-semibold text-gray-800">Date:</span> {patientDetails.date}</p>
                         </div>
                     </div>
                 </div>
                 <div className="overflow-hidden">
                     <div className="overflow-x-auto">
                         {prescribedMedicines.length > 0 ? (
                             <table className="min-w-full text-sm">
                                 <thead className="bg-gray-50">
                                 <tr>
                                     <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Medication</th>
                                     <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Dosage</th>
                                     <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Duration</th>
                                     <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Interval</th>
                                     <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                                 </tr>
                                 </thead>
                                 <tbody className="divide-y divide-gray-200">
                                 {prescribedMedicines.map((med, index) => (
                                     <tr key={med.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                     <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">{med.medicationName}</td>
                                     <td className="px-6 py-4 whitespace-nowrap text-gray-600">{med.dosage}</td>
                                     <td className="px-6 py-4 whitespace-nowrap text-gray-600">{med.doseDuration}</td>
                                     <td className="px-6 py-4 whitespace-nowrap text-gray-600">{med.doseInterval}</td>
                                     <td className="px-6 py-4 whitespace-nowrap">
                                         <div className="flex items-center gap-4">
                                             <button onClick={() => handleEdit(med.id)} className="text-blue-600 hover:text-blue-800 transition-colors duration-200" title="Edit">
                                                 <FaEdit size={16}/>
                                             </button>
                                             <button onClick={() => handleDelete(med.id)} className="text-red-600 hover:text-red-800 transition-colors duration-200" title="Delete">
                                                 <FaTrash size={16}/>
                                             </button>
                                         </div>
                                     </td>
                                     </tr>
                                 ))}
                                 </tbody>
                             </table>
                         ) : (
                             <div className="p-10 text-center">
                               <FaCapsules className="mx-auto text-4xl text-gray-300 mb-4"/>
                               <p className="text-gray-500">No medicines have been prescribed yet.</p>
                               <p className="text-sm text-gray-400 mt-1">Use the form above to add medications to this prescription.</p>
                             </div>
                         )}
                     </div>
                 </div>
             </div>

      </div>
    </div>
  );
};

export default AddPrescription;
