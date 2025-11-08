// src/components/Patients/PatientViewModal.jsx
import React from 'react';
import { 
    UserCircleIcon, 
    PhoneIcon, 
    EnvelopeIcon, 
    HomeModernIcon,
    HeartIcon,
    BriefcaseIcon,
    CalendarDaysIcon,
    MapPinIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';

const PatientViewModal = ({ patient, isOpen, onClose }) => {
    if (!isOpen || !patient) return null;

    const InfoSection = ({ title, icon, children }) => (
        <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center mb-3">
                <div className="text-indigo-600">
                    {icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 ml-2">{title}</h3>
            </div>
            {children}
        </div>
    );

    const InfoRow = ({ label, value }) => (
        <div className="flex justify-between py-2 border-b border-gray-100 last:border-b-0">
            <span className="text-sm font-medium text-gray-600">{label}:</span>
            <span className="text-sm text-gray-900">{value || 'N/A'}</span>
        </div>
    );

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
            {/* Transparent backdrop with blur effect */}
            <div 
                // className="absolute inset-0"
                className="absolute inset-0 bg-gray-100 bg-opacity-10"
                // className="absolute inset-0 backdrop-blur-xl"
                // className="absolute inset-0 bg-gradient-to-br from-white via-gray-50 to-gray-100 bg-opacity-80"
                onClick={onClose}
            />
            
            {/* Modal Content */}
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden relative border border-gray-200">
                {/* Header */}
                <div className="bg-indigo-600 text-white p-6">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center">
                            <UserCircleIcon className="h-10 w-10 mr-3" />
                            <div>
                                <h2 className="text-2xl font-bold">
                                    {patient.first_name} {patient.last_name}
                                </h2>
                                <p className="text-indigo-100">
                                    Patient ID: {patient.patient_id} | Age: {patient.age} | {patient.gender}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white hover:text-indigo-200 transition-colors bg-indigo-700 hover:bg-indigo-800 rounded-full p-1"
                        >
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column */}
                        <div className="space-y-6">
                            {/* Personal Information */}
                            <InfoSection title="Personal Information" icon={<UserCircleIcon className="h-5 w-5" />}>
                                <div className="space-y-1">
                                    <InfoRow label="Full Name" value={`${patient.first_name} ${patient.last_name}`} />
                                    <InfoRow label="Date of Birth" value={patient.date_of_birth} />
                                    <InfoRow label="Age" value={patient.age} />
                                    <InfoRow label="Gender" value={patient.gender} />
                                    <InfoRow label="Blood Group" value={patient.blood_group} />
                                    <InfoRow label="Marital Status" value={patient.marital_status} />
                                    <InfoRow label="Occupation" value={patient.occupation} />
                                    <InfoRow label="NID/Passport" value={patient.national_id} />
                                </div>
                            </InfoSection>

                            {/* Contact Information */}
                            <InfoSection title="Contact Information" icon={<PhoneIcon className="h-5 w-5" />}>
                                <div className="space-y-1">
                                    <InfoRow label="Phone" value={patient.phone} />
                                    <InfoRow label="Email" value={patient.email} />
                                    <div className="pt-2 mt-2 border-t border-gray-200">
                                        <p className="text-sm font-medium text-gray-600 mb-2">Emergency Contact:</p>
                                        <InfoRow label="Name" value={patient.emergency_contact_name} />
                                        <InfoRow label="Relation" value={patient.emergency_contact_relation} />
                                        <InfoRow label="Phone" value={patient.emergency_contact_phone} />
                                    </div>
                                </div>
                            </InfoSection>

                            {/* Insurance Information */}
                            <InfoSection title="Insurance Information" icon={<BriefcaseIcon className="h-5 w-5" />}>
                                <div className="space-y-1">
                                    <InfoRow label="Provider" value={patient.insurance_provider} />
                                    <InfoRow label="Policy Number" value={patient.insurance_number} />
                                </div>
                            </InfoSection>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-6">
                            {/* Address Information */}
                            <InfoSection title="Address Information" icon={<HomeModernIcon className="h-5 w-5" />}>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-sm font-medium text-gray-600 mb-1">Present Address:</p>
                                        <p className="text-sm text-gray-900">
                                            {patient.address && (
                                                <span>{patient.address}</span>
                                            )}
                                            {!patient.address && (
                                                <span className="text-gray-400">No address provided</span>
                                            )}
                                        </p>
                                        {patient.present_city && (
                                            <p className="text-sm text-gray-600 mt-1">
                                                {patient.present_city}, {patient.present_state} {patient.present_zip}, {patient.present_country}
                                            </p>
                                        )}
                                    </div>
                                    {patient.permanent_address && (
                                        <div className="pt-2 border-t border-gray-200">
                                            <p className="text-sm font-medium text-gray-600 mb-1">Permanent Address:</p>
                                            <p className="text-sm text-gray-900">{patient.permanent_address}</p>
                                            {patient.permanent_city && (
                                                <p className="text-sm text-gray-600 mt-1">
                                                    {patient.permanent_city}, {patient.permanent_state} {patient.permanent_zip}, {patient.permanent_country}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </InfoSection>

                            {/* Medical History */}
                            <InfoSection title="Medical History" icon={<HeartIcon className="h-5 w-5" />}>
                                <div className="space-y-3">
                                    {patient.allergies && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">Allergies:</p>
                                            <p className="text-sm text-gray-900 mt-1">{patient.allergies}</p>
                                        </div>
                                    )}
                                    {patient.current_medications && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">Current Medications:</p>
                                            <p className="text-sm text-gray-900 mt-1">{patient.current_medications}</p>
                                        </div>
                                    )}
                                    {patient.past_conditions && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">Past Conditions:</p>
                                            <p className="text-sm text-gray-900 mt-1">{patient.past_conditions}</p>
                                        </div>
                                    )}
                                    {patient.chronic_diseases && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">Chronic Diseases:</p>
                                            <p className="text-sm text-gray-900 mt-1">{patient.chronic_diseases}</p>
                                        </div>
                                    )}
                                    {patient.surgical_history && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">Surgical History:</p>
                                            <p className="text-sm text-gray-900 mt-1">{patient.surgical_history}</p>
                                        </div>
                                    )}
                                    {!patient.allergies && !patient.current_medications && !patient.past_conditions && 
                                     !patient.chronic_diseases && !patient.surgical_history && (
                                        <p className="text-sm text-gray-400 text-center py-4">No medical history recorded</p>
                                    )}
                                </div>
                            </InfoSection>

                            {/* Family Information */}
                            <InfoSection title="Family Information" icon={<UserCircleIcon className="h-5 w-5" />}>
                                <div className="space-y-1">
                                    <InfoRow label="Father's Name" value={patient.fathers_name} />
                                    <InfoRow label="Spouse Name" value={patient.spouse_name} />
                                </div>
                            </InfoSection>
                        </div>
                    </div>

                    {/* Timestamps */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
                            <div>
                                <span className="font-medium">Created:</span> {new Date(patient.created_at).toLocaleString()}
                            </div>
                            {patient.updated_at && patient.updated_at !== patient.created_at && (
                                <div>
                                    <span className="font-medium">Last Updated:</span> {new Date(patient.updated_at).toLocaleString()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PatientViewModal;