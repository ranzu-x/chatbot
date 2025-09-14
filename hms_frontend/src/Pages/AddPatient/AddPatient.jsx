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

// Reusable Section Header - Enhanced for better visual separation
const SectionHeader = ({ title, icon }) => (
    <div className="flex items-center mb-6 border-b border-gray-200 pb-4">
        {/* Cloning the icon to apply consistent styling */}
        {React.cloneElement(icon, { className: "h-7 w-7 text-indigo-600" })}
        <h3 className="text-xl font-semibold text-gray-800 ml-3">{title}</h3>
    </div>
);

const AddPatient = () => {
    const [formData, setFormData] = useState({
        // Patient Information
        patientId: '',
        firstName: '',
        lastName: '',
        fatherOrHusbandName: '',
        motherName: '',
        dateOfBirth: '',
        gender: '',
        nid: '',
        bloodGroup: '',
        // Contact Details
        phoneNumber: '',
        email: '',
        permanentAddress: '',
        presentAddress: '',
        district: '',
        upazila: '',
        // Emergency Contact
        emergencyContactName: '',
        emergencyContactRelation: '',
        emergencyContactPhone: '',
        // Admission Details
        department: '',
        consultantDoctor: '',
        admissionDate: '',
        ward: '',
        bedNumber: '',
        // Insurance & Payment
        insuranceProvider: '',
        policyNumber: '',
        paymentType: '',
        // Medical History
        allergies: '',
        currentMedications: '',
        pastConditions: '',
    });

    const [errors, setErrors] = useState({});

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const validate = () => {
        let tempErrors = {};
        if (!formData.firstName) tempErrors.firstName = "First name is required.";
        if (!formData.lastName) tempErrors.lastName = "Last name is required.";
        if (!formData.dateOfBirth) tempErrors.dateOfBirth = "Date of birth is required.";
        if (!formData.phoneNumber) tempErrors.phoneNumber = "Phone number is required.";
        if (!formData.bloodGroup) tempErrors.bloodGroup = "Blood group is required.";
        if (!formData.department) tempErrors.department = "Department is required.";
        if (!formData.emergencyContactName) tempErrors.emergencyContactName = "Emergency contact is required.";
        if (!formData.email) {
            tempErrors.email = "Email is required.";
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            tempErrors.email = "Email is not valid.";
        }
        setErrors(tempErrors);
        return Object.keys(tempErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validate()) {
            alert('This is a demo form. Patient data will not be saved.');
            console.log('Captured Patient Data:', formData);
        }
    };

    // Consistent styling for all input, select, and textarea elements
    const inputStyle = "mt-1 block w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm h-11 px-4 transition-shadow duration-300";
    const textareaStyle = "mt-1 block w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-4 py-2 transition-shadow duration-300";


    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl p-8 md:p-10">
                    {/* Page Header */}
                    <div className="flex items-center mb-10">
                        <div className="bg-indigo-100 p-3 rounded-full">
                            <PlusCircleIcon className="h-10 w-10 text-indigo-600" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 ml-4">Add New Patient</h1>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-12" noValidate>
                        {/* Section: Patient Information */}
                        <div className="p-8 rounded-xl border border-gray-200 bg-gray-50/50">
                            <SectionHeader title="Patient Information" icon={<UserCircleIcon />} />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Patient ID</label>
                                    <input type="text" name="patientId" onChange={handleChange} className={inputStyle} placeholder="Auto-generated or Manual" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                                    <input type="text" name="firstName" onChange={handleChange} className={inputStyle} />
                                    {errors.firstName && <p className="text-red-600 text-xs mt-1">{errors.firstName}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                                    <input type="text" name="lastName" onChange={handleChange} className={inputStyle} />
                                    {errors.lastName && <p className="text-red-600 text-xs mt-1">{errors.lastName}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Father / Husband Name</label>
                                    <input type="text" name="fatherOrHusbandName" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mother’s Name</label>
                                    <input type="text" name="motherName" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
                                    <input type="date" name="dateOfBirth" onChange={handleChange} className={inputStyle} />
                                    {errors.dateOfBirth && <p className="text-red-600 text-xs mt-1">{errors.dateOfBirth}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                                    <select name="gender" onChange={handleChange} className={inputStyle}>
                                        <option value="">Select...</option>
                                        <option>Male</option>
                                        <option>Female</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">NID / Birth Reg. / Passport</label>
                                    <input type="text" name="nid" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group *</label>
                                    <select name="bloodGroup" onChange={handleChange} className={inputStyle}>
                                        <option value="">Select...</option>
                                        <option>A+</option><option>A-</option><option>B+</option><option>B-</option>
                                        <option>O+</option><option>O-</option><option>AB+</option><option>AB-</option>
                                    </select>
                                    {errors.bloodGroup && <p className="text-red-600 text-xs mt-1">{errors.bloodGroup}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Section: Contact Details */}
                        <div className="p-8 rounded-xl border border-gray-200 bg-gray-50/50">
                            <SectionHeader title="Contact Details" icon={<PhoneIcon />} />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                                    <input type="tel" name="phoneNumber" placeholder="+8801XXXXXXXXX" onChange={handleChange} className={inputStyle} />
                                    {errors.phoneNumber && <p className="text-red-600 text-xs mt-1">{errors.phoneNumber}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                                    <input type="email" name="email" onChange={handleChange} className={inputStyle} />
                                    {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
                                </div>
                                <div className="lg:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Present Address</label>
                                    <input type="text" name="presentAddress" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div className="lg:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Permanent Address</label>
                                    <input type="text" name="permanentAddress" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                                    <input type="text" name="district" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Upazila</label>
                                    <input type="text" name="upazila" onChange={handleChange} className={inputStyle} />
                                </div>
                            </div>
                        </div>


                        {/* Section: Emergency Contact */}
                        <div className="p-8 rounded-xl border border-gray-200 bg-gray-50/50">
                            <SectionHeader title="Emergency Contact" icon={<UserCircleIcon />} />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                                    <input type="text" name="emergencyContactName" onChange={handleChange} className={inputStyle} />
                                    {errors.emergencyContactName && <p className="text-red-600 text-xs mt-1">{errors.emergencyContactName}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Relation</label>
                                    <input type="text" name="emergencyContactRelation" onChange={handleChange} className={inputStyle} placeholder="e.g., Father, Spouse" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                                    <input type="tel" name="emergencyContactPhone" onChange={handleChange} className={inputStyle} />
                                </div>
                            </div>
                        </div>

                        {/* Section: Admission Details */}
                        <div className="p-8 rounded-xl border border-gray-200 bg-gray-50/50">
                            <SectionHeader title="Admission Details" icon={<BuildingOffice2Icon />} />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                                    <select name="department" onChange={handleChange} className={inputStyle}>
                                        <option value="">Select...</option>
                                        <option>Medicine</option><option>Surgery</option><option>Cardiology</option>
                                        <option>Gynecology</option><option>Pediatrics</option><option>Orthopedics</option>
                                    </select>
                                    {errors.department && <p className="text-red-600 text-xs mt-1">{errors.department}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Consultant Doctor</label>
                                    <input type="text" name="consultantDoctor" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Admission Date</label>
                                    <input type="date" name="admissionDate" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ward / Cabin</label>
                                    <input type="text" name="ward" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Bed No.</label>
                                    <input type="text" name="bedNumber" onChange={handleChange} className={inputStyle} />
                                </div>
                            </div>
                        </div>

                        {/* Section: Insurance & Payment */}
                        <div className="p-8 rounded-xl border border-gray-200 bg-gray-50/50">
                            <SectionHeader title="Insurance & Payment" icon={<ShieldCheckIcon />} />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Provider</label>
                                    <input type="text" name="insuranceProvider" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Policy Number</label>
                                    <input type="text" name="policyNumber" onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
                                    <select name="paymentType" onChange={handleChange} className={inputStyle}>
                                        <option value="">Select...</option>
                                        <option>Cash</option><option>Bkash</option><option>Card</option><option>Insurance</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Section: Medical History */}
                        <div className="p-8 rounded-xl border border-gray-200 bg-gray-50/50">
                            <SectionHeader title="Medical History" icon={<CalendarDaysIcon />} />
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Known Allergies</label>
                                    <textarea name="allergies" rows="4" onChange={handleChange} className={textareaStyle}></textarea>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Medications</label>
                                    <textarea name="currentMedications" rows="4" onChange={handleChange} className={textareaStyle}></textarea>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Past Conditions / Surgeries</label>
                                    <textarea name="pastConditions" rows="4" onChange={handleChange} className={textareaStyle}></textarea>
                                </div>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="flex justify-end pt-8 border-t border-gray-200 mt-12">
                            <button type="button" className="bg-gray-200 text-gray-800 font-semibold py-3 px-6 rounded-lg hover:bg-gray-300 transition-colors duration-300">
                                Cancel
                            </button>
                            <button type="submit" className="ml-4 bg-indigo-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300 transform hover:scale-105">
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