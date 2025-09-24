import React from 'react';

const EditModal = () => {
    return (
        <div>
            {/* Edit Modal */}
            {isOpenView && selectedData && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg min-w-[600px] relative max-h-[90vh] overflow-y-auto">
                        {/* Profile Overview */}
                        <div className="flex items-center justify-center gap-4 mb-6">
                            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-700">
                                {selectedData.image?.[0] || <UserCircleIcon className="w-16 h-16 text-blue-300" />}
                            </div>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    className="text-2xl font-bold text-gray-900 w-full border-b border-gray-300 focus:outline-none focus:border-blue-500"
                                    defaultValue={selectedData[0].name}
                                />
                                <div className="flex items-center gap-5 mt-1">
                                    <input
                                        type="text"
                                        className="text-gray-600 w-24 border-b border-gray-300 focus:outline-none focus:border-blue-500"
                                        defaultValue={selectedData[0].gender}
                                    />
                                    <input
                                        type="number"
                                        className="text-gray-600 w-16 border-b border-gray-300 focus:outline-none focus:border-blue-500"
                                        defaultValue={selectedData[0].age}
                                    />
                                    <input
                                        type="text"
                                        className="text-sm text-gray-500 border-b border-gray-300 focus:outline-none focus:border-blue-500"
                                        defaultValue={selectedData[0].bloodGroup || "N/A"}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* All Data Inputs */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { label: "Phone Number", value: "phoneNumber" },
                                { label: "Email", value: "email" },
                                { label: "Present Address", value: "presentAddress" },
                                { label: "Permanent Address", value: "permanentAddress" },
                                { label: "Father/Husband Name", value: "fatherOrHusbandName" },
                                { label: "Mother Name", value: "motherName" },
                                { label: "NID", value: "nid" },
                                { label: "Emergency Contact Name", value: "emergencyContactName" },
                                { label: "Emergency Contact Relation", value: "emergencyContactRelation" },
                                { label: "Emergency Contact Phone", value: "emergencyContactPhone" },
                                { label: "Department", value: "department" },
                                { label: "Consultant Doctor", value: "consultantDoctor" },
                                { label: "Admission Date", value: "admissionDate" },
                                { label: "Ward", value: "ward" },
                                { label: "Bed Number", value: "bedNumber" },
                                { label: "Past Conditions", value: "pastConditions", textarea: true },
                                { label: "Current Medications", value: "currentMedications", textarea: true },
                                { label: "Allergies", value: "allergies", textarea: true },
                            ].map((item, idx) => (
                                <div key={idx}>
                                    <label className="text-sm text-gray-500">{item.label}</label>
                                    {item.textarea ? (
                                        <textarea
                                            className="w-full text-gray-800 font-medium border border-gray-300 rounded p-1 focus:outline-none focus:border-blue-500"
                                            defaultValue={selectedData[0][item.value] || ""}
                                        />
                                    ) : (
                                        <input
                                            type={item.value === "age" || item.value.includes("Number") ? "text" : "text"}
                                            className="w-full text-gray-800 font-medium border-b border-gray-300 focus:outline-none focus:border-blue-500"
                                            defaultValue={selectedData[0][item.value] || ""}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Close Button */}
                        <button
                            onClick={closeModal}
                            className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700"
                        >
                            <XCircleIcon className="w-8 h-8 text-blue-500" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditModal;