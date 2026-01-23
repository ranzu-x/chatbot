import React, { useState } from 'react';

const PrescriptionDoc = () => {

      const [prescribedMedicines, setPrescribedMedicines] = useState([]);
      // --- State for Doctor and Patient Details ---
      const [doctorDetails, setDoctorDetails] = useState({
        name: 'Dr. Emily Carter',
        clinic: 'Community Health Clinic',
        contact: 'contact@healthclinic.com',
      });
    
      const [patientDetails, setPatientDetails] = useState({
        name: '',
        age: '',
        gender: 'Male',
        date: new Date().toISOString().slice(0, 10), // Default to today
      });
    
    return (
                <div>
            <div className="bg-white rounded-t-xl shadow-md p-6 border-b-2 border-dashed">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">Prescription</h2>
                <div className="flex justify-between items-start text-sm text-gray-600">
                    {/* Doctor Details */}
                    <div>
                        <p className="font-bold text-gray-800">{doctorDetails.name}</p>
                        <p>{doctorDetails.clinic}</p>
                        <p>{doctorDetails.contact}</p>
                    </div>
                    {/* Patient Details */}
                    <div className="text-right">
                        <p><span className="font-semibold">Patient:</span> {patientDetails.name || 'N/A'}</p>
                        <p><span className="font-semibold">Age:</span> {patientDetails.age || 'N/A'}, <span className="font-semibold">Gender:</span> {patientDetails.gender}</p>
                        <p><span className="font-semibold">Date:</span> {patientDetails.date}</p>
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-b-xl shadow-md overflow-hidden">
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
    );
};

export default PrescriptionDoc;