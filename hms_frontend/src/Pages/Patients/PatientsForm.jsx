// src/pages/Patients/PatientsForm.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Swal from "sweetalert2";
import { 
    PlusCircleIcon, 
    UserCircleIcon, 
    PhoneIcon, 
    BuildingOffice2Icon, 
    ShieldCheckIcon,
    PencilSquareIcon,
    HeartIcon,
    BriefcaseIcon
} from "@heroicons/react/24/outline";

const PatientsForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(id);
    
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
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
        maritalStatus: '',
        occupation: '',
        
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
        
        // Medical
        allergies: '',
        currentMedications: '',
        pastConditions: '',
        chronicDiseases: '',
        surgicalHistory: '',
        
        // Insurance
        insuranceProvider: '',
        insuranceNumber: ''
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEditMode) {
            fetchPatientData();
        }
    }, [id]);

    const fetchPatientData = async () => {
        setLoading(true);
        try {
            const response = await fetch(`http://localhost:5000/api/v1/patients/${id}`, {
                credentials: "include"
            });
            
            if (!response.ok) throw new Error("Failed to fetch patient data");
            
            const patient = await response.json();
            console.log("Fetched patient data:", patient);
            
            setFormData({
                firstName: patient.first_name || '',
                lastName: patient.last_name || '',
                dateOfBirth: patient.date_of_birth || '',
                age: patient.age?.toString() || '',
                gender: patient.gender || '',
                bloodGroup: patient.blood_group || '',
                nid: patient.national_id || '',
                maritalStatus: patient.marital_status || '',
                occupation: patient.occupation || '',
                
                phoneNumber: patient.phone || '',
                email: patient.email || '',
                emergencyContactName: patient.emergency_contact_name || '',
                emergencyContactRelation: patient.emergency_contact_relation || '',
                emergencyContactPhone: patient.emergency_contact_phone || '',
                
                presentAddress: patient.address || '',
                presentCity: patient.city || '',
                presentState: patient.state_or_div || '',
                presentZip: patient.zip_code || '',
                presentCountry: patient.country || '',
                
                
                allergies: patient.allergies || '',
                currentMedications: patient.current_medications || '',
                pastConditions: patient.past_conditions || '',
                chronicDiseases: patient.chronic_diseases || '',
                surgicalHistory: patient.surgical_history || '',
                
                insuranceProvider: patient.insurance_provider || '',
                insuranceNumber: patient.insurance_number || ''
            });

            
        } catch (error) {
            console.error("Error fetching patient:", error);
            Swal.fire("Error", "Failed to load patient data", "error");
            navigate("/patients");
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value === "" ? null : value, })); // 👈 convert empty string to null
        
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const calculateAgeFromDOB = (dateString) => {
        if (!dateString) return '';
        const birthDate = new Date(dateString);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age.toString();
    };

    const calculateDOBFromAge = (age) => {
        if (!age) return '';
        const today = new Date();
        const birthYear = today.getFullYear() - parseInt(age);
        return `${birthYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    };

    const handleDateOfBirthChange = (e) => {
        const { value } = e.target;
        setFormData(prev => ({
            ...prev,
            dateOfBirth: value,
            age: calculateAgeFromDOB(value)
        }));
    };

    const handleAgeChange = (e) => {
        const { value } = e.target;
        setFormData(prev => ({
            ...prev,
            age: value,
            dateOfBirth: calculateDOBFromAge(value)
        }));
    };

    const validateForm = () => {
        const newErrors = {};
        
        if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
        if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
        if (!formData.dateOfBirth) newErrors.dateOfBirth = "Date of birth is required";
        if (!formData.age) newErrors.age = "Age is required";
        if (!formData.gender) newErrors.gender = "Gender is required";
        if (!formData.bloodGroup) newErrors.bloodGroup = "Blood group is required";
        if (!formData.phoneNumber.trim()) newErrors.phoneNumber = "Phone number is required";
        if (!formData.email.trim()) newErrors.email = "Email is required";
        if (!formData.emergencyContactName.trim()) newErrors.emergencyContactName = "Emergency contact name is required";
        if (!formData.emergencyContactPhone.trim()) newErrors.emergencyContactPhone = "Emergency contact phone is required";

        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (formData.email && !emailRegex.test(formData.email)) {
            newErrors.email = "Please enter a valid email address";
        }
        
        const phoneRegex = /^[0-9+\-\s()]{10,}$/;
        if (formData.phoneNumber && !phoneRegex.test(formData.phoneNumber.replace(/\s/g, ''))) {
            newErrors.phoneNumber = "Please enter a valid phone number";
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            Swal.fire("Validation Error", "Please fix the errors in the form", "error");
            return;
        }

        setLoading(true);
        try {
            const apiData = {
            // Patient Information
            firstName: formData.firstName,
            lastName: formData.lastName,
            dateOfBirth: formData.dateOfBirth,
            age: parseInt(formData.age),
            gender: formData.gender,
            bloodGroup: formData.bloodGroup,
            nid: formData.nid,
            maritalStatus: formData.maritalStatus,
            occupation: formData.occupation,
            
            // Contact Information
            phoneNumber: formData.phoneNumber,
            email: formData.email,
            emergencyContactName: formData.emergencyContactName,
            emergencyContactRelation: formData.emergencyContactRelation,
            emergencyContactPhone: formData.emergencyContactPhone,
            
            // Present Address
            presentAddress: formData.presentAddress,
            presentCity: formData.presentCity,
            presentState: formData.presentState,
            presentZip: formData.presentZip,
            presentCountry: formData.presentCountry,
            
            
            // Medical History
            allergies: formData.allergies,
            currentMedications: formData.currentMedications,
            pastConditions: formData.pastConditions,
            chronicDiseases: formData.chronicDiseases,
            surgicalHistory: formData.surgicalHistory,
            
            // Insurance
            insuranceProvider: formData.insuranceProvider,
            insuranceNumber: formData.insuranceNumber
            };

            const url = isEditMode 
                ? `http://localhost:5000/api/v1/patients/${id}`
                : 'http://localhost:5000/api/v1/patients';
            
            const method = isEditMode ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: "include",
                body: JSON.stringify(apiData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Failed to ${isEditMode ? 'update' : 'create'} patient`);
            }

            const successMessage = isEditMode 
                ? "Patient updated successfully!" 
                : "Patient created successfully!";
            
            await Swal.fire("Success", successMessage, "success");
            navigate("/patients");

        } catch (error) {
            console.error("Error saving patient:", error);
            Swal.fire("Error", error.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        navigate("/patients");
    };

    const compactInputStyle = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";
    const compactTextareaStyle = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none";

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

    if (loading && isEditMode) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading patient data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-full mx-auto">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    {/* Dynamic Header */}
                    <div className="flex items-center mb-6">
                        <div className={`p-2 rounded-lg ${isEditMode ? 'bg-yellow-100' : 'bg-indigo-100'}`}>
                            {isEditMode ? (
                                <PencilSquareIcon className="h-6 w-6 text-yellow-600" />
                            ) : (
                                <PlusCircleIcon className="h-6 w-6 text-indigo-600" />
                            )}
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900 ml-3">
                                {isEditMode ? 'Edit Patient' : 'Add New Patient'}
                            </h1>
                            {isEditMode && (
                                <p className="text-sm text-gray-500 ml-3">Patient ID: {id}</p>
                            )}
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                        {/* Patient Information - Updated with Marital Status and Occupation */}
                        <div className="p-4 rounded-lg border border-gray-100 bg-white">
                            <SectionHeader title="Patient Information" icon={<UserCircleIcon className="h-4 w-4" />} compact />
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                                    <input 
                                        type="text" 
                                        value={formData.firstName} 
                                        name="firstName" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                    />
                                    {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                                    <input 
                                        type="text" 
                                        value={formData.lastName} 
                                        name="lastName" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                    />
                                    {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth *</label>
                                    <input 
                                        value={formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString().split('T')[0] : ''} 
                                        type="date" 
                                        name="dateOfBirth" 
                                        onChange={handleDateOfBirthChange} 
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
                                        onChange={handleAgeChange} 
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
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Marital Status</label>
                                    <select value={formData.maritalStatus} name="maritalStatus" onChange={handleChange} className={compactInputStyle}>
                                        <option value="">Select...</option>
                                        <option>Single</option>
                                        <option>Married</option>
                                        <option>Divorcee</option>
                                        <option>Widow</option>
                                        <option>Others</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Occupation</label>
                                    <input 
                                        value={formData.occupation} 
                                        type="text" 
                                        name="occupation" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                        placeholder="e.g., Teacher, Engineer, Business"
                                    />
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
                                    <input 
                                        type="text" 
                                        value={formData.emergencyContactName} 
                                        name="emergencyContactName" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                    />
                                    {errors.emergencyContactName && <p className="text-red-500 text-xs mt-1">{errors.emergencyContactName}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Relation</label>
                                    <input 
                                        type="text" 
                                        value={formData.emergencyContactRelation} 
                                        name="emergencyContactRelation" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                        placeholder="e.g., Father, Spouse" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Phone *</label>
                                    <input 
                                        type="tel" 
                                        value={formData.emergencyContactPhone} 
                                        name="emergencyContactPhone" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                    />
                                    {errors.emergencyContactPhone && <p className="text-red-500 text-xs mt-1">{errors.emergencyContactPhone}</p>}
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
                        </div>

                        {/* Enhanced Medical History with New Fields */}
                        <div className="p-4 rounded-lg border border-gray-100 bg-white">
                            <SectionHeader title="Medical History" icon={<HeartIcon className="h-4 w-4" />} compact />
                            <div className="grid grid-cols-1 gap-3 mt-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Known Allergies</label>
                                    <textarea 
                                        name="allergies" 
                                        rows="2" 
                                        value={formData.allergies}
                                        onChange={handleChange} 
                                        className={compactTextareaStyle} 
                                        placeholder="List any known allergies..."
                                    ></textarea>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Current Medications</label>
                                        <textarea 
                                            name="currentMedications" 
                                            rows="2" 
                                            value={formData.currentMedications}
                                            onChange={handleChange} 
                                            className={compactTextareaStyle} 
                                            placeholder="Current medications..."
                                        ></textarea>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Past Medical Conditions</label>
                                        <textarea 
                                            name="pastConditions" 
                                            rows="2" 
                                            value={formData.pastConditions}
                                            onChange={handleChange} 
                                            className={compactTextareaStyle} 
                                            placeholder="Past medical history..."
                                        ></textarea>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Chronic Diseases</label>
                                        <textarea 
                                            name="chronicDiseases" 
                                            rows="2" 
                                            value={formData.chronicDiseases}
                                            onChange={handleChange} 
                                            className={compactTextareaStyle} 
                                            placeholder="e.g., Diabetes, Hypertension, Asthma..."
                                        ></textarea>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Surgical History</label>
                                        <textarea 
                                            name="surgicalHistory" 
                                            rows="2" 
                                            value={formData.surgicalHistory}
                                            onChange={handleChange} 
                                            className={compactTextareaStyle} 
                                            placeholder="Previous surgeries with dates..."
                                        ></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Insurance Information */}
                        <div className="p-4 rounded-lg border border-gray-100 bg-white">
                            <SectionHeader title="Insurance Information" icon={<BriefcaseIcon className="h-4 w-4" />} compact />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Provider</label>
                                    <input 
                                        type="text" 
                                        value={formData.insuranceProvider} 
                                        name="insuranceProvider" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                        placeholder="e.g., Delta Life, Green Life, Pragati"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Number</label>
                                    <input 
                                        type="text" 
                                        value={formData.insuranceNumber} 
                                        name="insuranceNumber" 
                                        onChange={handleChange} 
                                        className={compactInputStyle} 
                                        placeholder="Policy number"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <button 
                                type="button" 
                                onClick={handleCancel}
                                className="text-gray-600 text-sm font-medium py-2 px-4 rounded hover:bg-gray-50 transition-colors"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                className="ml-3 bg-indigo-600 text-white text-sm font-medium py-2 px-6 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        {isEditMode ? 'Updating...' : 'Creating...'}
                                    </span>
                                ) : (
                                    isEditMode ? 'Update Patient' : 'Add Patient'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PatientsForm;