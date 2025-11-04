import React, { useState } from 'react';
import {
    UserCircleIcon,
    PhoneIcon,
    EnvelopeIcon,
    ShieldCheckIcon,
    PlusCircleIcon,
    CalendarDaysIcon,
    BuildingOffice2Icon
} from '@heroicons/react/24/outline';
import Swal from 'sweetalert2'
import { useNavigate } from 'react-router';

// Reusable Section Header - Enhanced for better visual separation
const SectionHeader = ({ title, icon, compact = false }) => (
    <div className={`flex items-center ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className={`${compact ? 'text-gray-500' : 'text-indigo-600'}`}>
            {icon}
        </div>
        <h3 className={`font-medium ${compact ? 'text-sm ml-2' : 'text-lg ml-3'} text-gray-900`}>
            {title}
        </h3>
    </div>
);

const AddPatient = () => {
    const initialFormData = {
        // Patient Information
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        age: '',
        gender: '',
        bloodGroup: '',
        fathersName: '',
        spouseName: '',
        nid: '',

        // Contact Information
        phoneNumber: '',
        email: '',
        emergencyContactName: '',
        emergencyContactRelation: '',
        emergencyContactPhone: '',

        // Present Address
        presentAddress: '',
        presentCity: '',
        presentState: '',
        presentZip: '',
        presentCountry: '',

        // Permanent Address
        permanentAddress: '',
        permanentCity: '',
        permanentState: '',
        permanentZip: '',
        permanentCountry: '',

        // Medical
        allergies: '',
        currentMedications: '',
        pastConditions: ''
    }
    const [formData, setFormData] = useState(initialFormData);
    const navigate = useNavigate();

    const [errors, setErrors] = useState({});
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    // validation the form field
    const validate = () => {
        let tempErrors = {};
        if (!formData.firstName) tempErrors.firstName = "First name is required.";
        if (!formData.lastName) tempErrors.lastName = "Last name is required.";
        if (!formData.age) tempErrors.age = "age is required.";
        // if (!formData.dateOfBirth) tempErrors.dateOfBirth = "Date of birth is required.";
        if (!formData.phoneNumber) tempErrors.phoneNumber = "Phone number is required.";
        // if (!formData.bloodGroup) tempErrors.bloodGroup = "Blood group is required.";
        // if (!formData.department) tempErrors.department = "Department is required.";
        // if (!formData.emergencyContactName) tempErrors.emergencyContactName = "Emergency contact is required.";
        if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
            tempErrors.email = "Email is not valid.";
        }
        setErrors(tempErrors);
        return Object.keys(tempErrors).length === 0;
    };

    // Handle Form Data
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) {
            Swal.fire({
                icon: "error",
                title: "Required Field Empty",
                text: "Please complete required field",
                footer: '<a href="#">Form submission failed: missing required field</a>'
            });
        }
        else {
            // Send Data to backend
            fetch("http://localhost:5000/api/v1/add_patients",
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',

                    },
                    credentials: "include",
                    body: JSON.stringify(
                        {
                            firstName: formData.firstName,
                            lastName: formData.lastName,
                            gender: formData.gender,
                            age: formData.age,
                            phoneNumber: formData.phoneNumber,
                            presentAddress: formData.presentAddress,
                            permanentAddress: formData.permanentAddress,
                            fathersName: formData.fathersName,
                            motherName: formData.motherName,
                            nid: formData.nid,
                            bloodGroup: formData.bloodGroup,
                            email: formData.email,
                            emergencyContactName: formData.emergencyContactName,
                            emergencyContactRelation: formData.emergencyContactRelation,
                            emergencyContactPhone: formData.emergencyContactPhone,
                            department: formData.department,
                            consultantDoctor: formData.consultantDoctor,
                            admissionDate: formData.admissionDate,
                            ward: formData.ward,
                            bedNumber: formData.bedNumber,
                            pastConditions: formData.pastConditions,
                            currentMedications: formData.currentMedications,
                            allergies: formData.allergies
                        }
                    ),
                })
                .then(res => res.json())
                .then(result => {
                    console.log("This is the result", result)
                    if (result.insertId > 0) {
                        Swal.fire({
                            title: `Patient: ${formData.firstName} Added Successful`,
                            icon: "success",
                            draggable: true
                        });
                        setFormData(initialFormData);
                        navigate('/patients');
                    }
                    else {
                        Swal.fire({
                            icon: "error",
                            title: result.message,
                            text: result.message,
                            // footer: '<a href="#"></a>'
                        });
                    }
                })
        }
    };

    // Consistent styling for all input, select, and textarea elements
    const compactInputStyle = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";
    const compactTextareaStyle = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none";

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-full mx-auto">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    {/* Compact Header */}
                    <div className="flex items-center mb-6">
                        <div className="bg-indigo-100 p-2 rounded-lg">
                            <PlusCircleIcon className="h-6 w-6 text-indigo-600" />
                        </div>
                        <h1 className="text-xl font-semibold text-gray-900 ml-3">Add New Patient</h1>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                        {/* Patient Information - Enhanced with Auto-calculations */}
                        <div className="p-4 rounded-lg border border-gray-100 bg-white">
                            <SectionHeader title="Patient Information" icon={<UserCircleIcon className="h-4 w-4" />} compact />
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                                    <input type="text" value={formData.firstName} name="firstName" onChange={handleChange} className={compactInputStyle} />
                                    {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                                    <input type="text" value={formData.lastName} name="lastName" onChange={handleChange} className={compactInputStyle} />
                                    {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth *</label>
                                    <input
                                        value={formData.dateOfBirth}
                                        type="date"
                                        name="dateOfBirth"
                                        onChange={(e) => {
                                            handleChange(e);
                                            // Auto-calculate age when DOB changes
                                            if (e.target.value) {
                                                const birthDate = new Date(e.target.value);
                                                const today = new Date();
                                                let age = today.getFullYear() - birthDate.getFullYear();
                                                const monthDiff = today.getMonth() - birthDate.getMonth();
                                                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                                                    age--;
                                                }
                                                setFormData(prev => ({ ...prev, age: age.toString() }));
                                            }
                                        }}
                                        className={compactInputStyle}
                                    />
                                    {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Age *</label>
                                    <input
                                        value={formData.age}
                                        type="number"
                                        name="age"
                                        onChange={(e) => {
                                            handleChange(e);
                                            // Auto-calculate DOB when age changes
                                            if (e.target.value) {
                                                const today = new Date();
                                                const birthYear = today.getFullYear() - parseInt(e.target.value);
                                                const calculatedDOB = `${birthYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                                setFormData(prev => ({ ...prev, dateOfBirth: calculatedDOB }));
                                            }
                                        }}
                                        className={compactInputStyle}
                                        min="0"
                                        max="120"
                                    />
                                    {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Gender *</label>
                                    <select value={formData.gender} name="gender" onChange={handleChange} className={compactInputStyle}>
                                        <option value="">Select...</option>
                                        <option>Male</option>
                                        <option>Female</option>
                                        <option>Other</option>
                                    </select>
                                    {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Blood Group *</label>
                                    <select value={formData.bloodGroup} name="bloodGroup" onChange={handleChange} className={compactInputStyle}>
                                        <option value="">Select...</option>
                                        <option>A+</option><option>A-</option><option>B+</option><option>B-</option>
                                        <option>O+</option><option>O-</option><option>AB+</option><option>AB-</option>
                                    </select>
                                    {errors.bloodGroup && <p className="text-red-500 text-xs mt-1">{errors.bloodGroup}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Father's Name</label>
                                    <input value={formData.fathersName} type="text" name="fathersName" onChange={handleChange} className={compactInputStyle} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Spouse Name</label>
                                    <input value={formData.spouseName} type="text" name="spouseName" onChange={handleChange} className={compactInputStyle} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">NID/Passport</label>
                                    <input value={formData.nid} type="text" name="nid" onChange={handleChange} className={compactInputStyle} />
                                </div>
                            </div>
                        </div>

                        {/* Combined Contact & Emergency Contact */}
                        <div className="p-4 rounded-lg border border-gray-100 bg-white">
                            <SectionHeader title="Contact Information" icon={<PhoneIcon className="h-4 w-4" />} compact />
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number *</label>
                                    <input value={formData.phoneNumber} type="tel" name="phoneNumber" onChange={handleChange} className={compactInputStyle} />
                                    {errors.phoneNumber && <p className="text-red-500 text-xs mt-1">{errors.phoneNumber}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Email Address *</label>
                                    <input value={formData.email} type="email" name="email" onChange={handleChange} className={compactInputStyle} />
                                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Contact Name *</label>
                                    <input type="text" name="emergencyContactName" onChange={handleChange} className={compactInputStyle} />
                                    {errors.emergencyContactName && <p className="text-red-500 text-xs mt-1">{errors.emergencyContactName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Relation</label>
                                    <input type="text" name="emergencyContactRelation" onChange={handleChange} className={compactInputStyle} placeholder="e.g., Father, Spouse" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Phone</label>
                                    <input type="tel" name="emergencyContactPhone" onChange={handleChange} className={compactInputStyle} />
                                </div>
                            </div>
                        </div>

                        {/* Enhanced Address Block */}
                        <div className="p-4 rounded-lg border border-gray-100 bg-white">
                            <SectionHeader title="Address Information" icon={<BuildingOffice2Icon className="h-4 w-4" />} compact />

                            {/* Present Address */}
                            <div className="mb-4 pb-4 border-b border-gray-100">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Present Address</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div className="lg:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Street Address</label>
                                        <input value={formData.presentAddress} type="text" name="presentAddress" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                                        <input value={formData.presentCity} type="text" name="presentCity" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">State/Division</label>
                                        <input value={formData.presentState} type="text" name="presentState" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">ZIP/Postal Code</label>
                                        <input value={formData.presentZip} type="text" name="presentZip" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                                        <input value={formData.presentCountry} type="text" name="presentCountry" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                </div>
                            </div>

                            {/* Permanent Address */}
                            <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Permanent Address</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div className="lg:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Street Address</label>
                                        <input value={formData.permanentAddress} type="text" name="permanentAddress" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                                        <input value={formData.permanentCity} type="text" name="permanentCity" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">State/Division</label>
                                        <input value={formData.permanentState} type="text" name="permanentState" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">ZIP/Postal Code</label>
                                        <input value={formData.permanentZip} type="text" name="permanentZip" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                                        <input value={formData.permanentCountry} type="text" name="permanentCountry" onChange={handleChange} className={compactInputStyle} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Medical History - Compact */}
                        <div className="p-4 rounded-lg border border-gray-100 bg-white">
                            <SectionHeader title="Medical Notes" icon={<ShieldCheckIcon className="h-4 w-4" />} compact />
                            <div className="grid grid-cols-1 gap-3 mt-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Known Allergies</label>
                                    <textarea name="allergies" rows="2" onChange={handleChange} className={compactTextareaStyle} placeholder="List any known allergies..."></textarea>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Current Medications</label>
                                        <textarea name="currentMedications" rows="2" onChange={handleChange} className={compactTextareaStyle} placeholder="Current medications..."></textarea>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Past Conditions</label>
                                        <textarea name="pastConditions" rows="2" onChange={handleChange} className={compactTextareaStyle} placeholder="Past medical history..."></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Compact Buttons */}
                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <button type="button" className="text-gray-600 text-sm font-medium py-2 px-4 rounded hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" className="ml-3 bg-indigo-600 text-white text-sm font-medium py-2 px-6 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
                                Add Patient
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AddPatient;