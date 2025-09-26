import React, { useEffect, useState } from 'react';
// Import icons for a better UI
import { FaTrash, FaEdit } from 'react-icons/fa';

// --- Mock Data and API (same as before) ---
const allMedicines = [
  { id: 'med1', name: 'Paracetamol 500mg' },
  { id: 'med2', name: 'Amoxicillin 250mg' },
  { id: 'med3', name: 'Ibuprofen 200mg' },
  { id: 'med4', name: 'Aspirin 75mg' },
  { id: 'med5', name: 'Omeprazole 20mg' },
  { id: 'med6', name: 'Metformin 500mg' },
  { id: 'med7', name: 'Atorvastatin 10mg' },
];

const fetchMedicinesFromDB = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(allMedicines);
    }, 1000); // Simulate a 1-second network delay
  });
};

const Prescription = () => {
  // State for the dropdown options
  const [medicationOptions, setMedicationOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // State for the final list of prescribed medicines
  const [prescribedMedicines, setPrescribedMedicines] = useState([]);

  // State to track if we are in "edit mode" and which medicine is being edited
  const [editingId, setEditingId] = useState(null);

  // Initial state for a single prescription entry
  const initialPrescriptionState = {
    medicationId: '',
    medicationName: '',
    dosage: '',
    doseDuration: '',
    time: 'After Meal',
    doseInterval: 'Once a day',
    comment: '',
  };

  // State for the form's input fields
  const [currentPrescription, setCurrentPrescription] = useState(initialPrescriptionState);

  // Fetch medications on component mount
  useEffect(() => {
    fetchMedicinesFromDB().then((data) => {
      setMedicationOptions(data);
      setIsLoading(false);
    });
  }, []);

  // --- Event Handlers ---

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

  // --- Core CRUD Functions ---

  const handleAddOrUpdateMedicine = () => {
    // Basic validation
    if (!currentPrescription.medicationId || !currentPrescription.dosage) {
      alert('Please select a medication and enter a dosage.');
      return;
    }

    // If we are in edit mode, update the existing medicine
    if (editingId !== null) {
      setPrescribedMedicines((prevMedicines) =>
        prevMedicines.map((med) =>
          med.id === editingId ? { ...currentPrescription, id: editingId } : med
        )
      );
    } else {
      // Otherwise, add a new medicine with a unique ID
      setPrescribedMedicines((prev) => [
        ...prev,
        { ...currentPrescription, id: Date.now() },
      ]);
    }

    // Reset the form and exit edit mode
    setCurrentPrescription(initialPrescriptionState);
    setEditingId(null);
  };

  const handleEdit = (id) => {
    // Find the medicine to edit from the list
    const medicineToEdit = prescribedMedicines.find((med) => med.id === id);
    if (medicineToEdit) {
      // Set the form's state to the data of the medicine being edited
      setCurrentPrescription(medicineToEdit);
      // Enter "edit mode"
      setEditingId(id);
    }
  };

  const handleDelete = (id) => {
    // Filter out the medicine with the matching ID
    setPrescribedMedicines((prevMedicines) =>
      prevMedicines.filter((med) => med.id !== id)
    );
  };

  // Function to cancel editing
  const cancelEdit = () => {
    setCurrentPrescription(initialPrescriptionState);
    setEditingId(null);
  };

  return (
    <div className="bg-gray-50 min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Create Prescription</h1>
          <p className="text-sm text-gray-500 mt-1">Add, edit, or remove medications to manage patient prescriptions.</p>
        </header>

        {/* Medication Entry Form Card */}
        <div className="bg-white p-6 rounded-xl shadow-md mb-8">
           <h2 className="text-xl font-semibold text-gray-700 mb-4 border-b pb-3">
            {editingId ? 'Edit Medicine' : 'Add New Medicine'}
          </h2>
          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            {/* Medication Dropdown */}
            <div className="lg:col-span-1">
              <label htmlFor="medicationId" className="block text-sm font-medium text-gray-600 mb-1">Medication</label>
              <select id="medicationId" name="medicationId" value={currentPrescription.medicationId} onChange={handleMedicationSelect} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500" disabled={isLoading}>
                <option value="">{isLoading ? 'Loading...' : 'Select a medication'}</option>
                {medicationOptions.map((med) => (<option key={med.id} value={med.id}>{med.name}</option>))}
              </select>
            </div>
            {/* Dosage */}
            <div>
              <label htmlFor="dosage" className="block text-sm font-medium text-gray-600 mb-1">Dosage</label>
              <input type="text" id="dosage" name="dosage" value={currentPrescription.dosage} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g., 1 tablet"/>
            </div>
            {/* Dose Duration */}
            <div>
              <label htmlFor="doseDuration" className="block text-sm font-medium text-gray-600 mb-1">Dose Duration</label>
              <input type="text" id="doseDuration" name="doseDuration" value={currentPrescription.doseDuration} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g., 7 days"/>
            </div>
            {/* Time */}
            <div>
              <label htmlFor="time" className="block text-sm font-medium text-gray-600 mb-1">Time</label>
              <select id="time" name="time" value={currentPrescription.time} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500">
                <option>After Meal</option>
                <option>Before Meal</option>
                <option>With Meal</option>
              </select>
            </div>
            {/* Dose Interval */}
            <div>
              <label htmlFor="doseInterval" className="block text-sm font-medium text-gray-600 mb-1">Dose Interval</label>
              <select id="doseInterval" name="doseInterval" value={currentPrescription.doseInterval} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500">
                <option>Once a day</option>
                <option>Twice a day</option>
                <option>Three times a day</option>
                <option>As needed</option>
              </select>
            </div>
            {/* Comment */}
            <div className="md:col-span-2 lg:col-span-1">
              <label htmlFor="comment" className="block text-sm font-medium text-gray-600 mb-1">Comment</label>
              <input type="text" id="comment" name="comment" value={currentPrescription.comment} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500" placeholder="Optional notes"/>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="mt-6 flex justify-end items-center gap-4">
            {editingId && (
              <button onClick={cancelEdit} className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition duration-200">
                Cancel
              </button>
            )}
            <button onClick={handleAddOrUpdateMedicine} className={`px-6 py-2 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-75 transition duration-200 ${editingId ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}`}>
              {editingId ? 'Update Medicine' : 'Add Medicine'}
            </button>
          </div>
        </div>

        {/* Prescription List Table */}
        <div>
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Prescribed Medicines</h2>
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    {prescribedMedicines.length > 0 ? (
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                            <tr>
                                <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Medication</th>
                                <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Dosage</th>
                                <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Duration</th>
                                <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Interval</th>
                                <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                            {prescribedMedicines.map((med) => (
                                <tr key={med.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-gray-800">{med.medicationName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-600">{med.dosage}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-600">{med.doseDuration}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-600">{med.doseInterval}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => handleEdit(med.id)} className="text-blue-500 hover:text-blue-700 transition-colors duration-200">
                                            <FaEdit size={16}/>
                                        </button>
                                        <button onClick={() => handleDelete(med.id)} className="text-red-500 hover:text-red-700 transition-colors duration-200">
                                            <FaTrash size={16}/>
                                        </button>
                                    </div>
                                </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="p-6 text-center text-gray-500">No medicines have been prescribed yet.</p>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};


export default Prescription;