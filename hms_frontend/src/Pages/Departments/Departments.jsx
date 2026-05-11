import React, { useState } from 'react';
import { RectangleStackIcon, MagnifyingGlassIcon, PlusIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline';

const Departments = () => {
    const [searchTerm, setSearchTerm] = useState('');

    const departments = [
        { name: 'Emergency Medicine', code: 'EM', head: 'Dr. Sarah Wilson', staff: 24, status: 'Active' },
        { name: 'Cardiology', code: 'CARD', head: 'Dr. Michael Chen', staff: 18, status: 'Active' },
        { name: 'Neurology', code: 'NEUR', head: 'Dr. James Miller', staff: 12, status: 'Active' },
        { name: 'Orthopedics', code: 'ORTH', head: 'Dr. Robert Brown', staff: 15, status: 'Active' },
        { name: 'Pediatrics', code: 'PEDS', head: 'Dr. Emily Davis', staff: 20, status: 'Active' },
        { name: 'General Medicine', code: 'GEN', head: 'Dr. David Wilson', staff: 30, status: 'Active' },
        { name: 'Surgery', code: 'SURG', head: 'Dr. Thomas Moore', staff: 25, status: 'Active' },
        { name: 'Radiology', code: 'RAD', head: 'Dr. Lisa Anderson', staff: 10, status: 'Active' },
        { name: 'Laboratory', code: 'LAB', head: 'John Smith', staff: 14, status: 'Active' },
        { name: 'Pharmacy', code: 'PHARM', head: 'Mary Taylor', staff: 8, status: 'Active' },
        { name: 'ICU', code: 'ICU', head: 'Dr. Kevin White', staff: 16, status: 'Active' },
        { name: 'Oncology', code: 'ONC', head: 'Dr. Patricia Hall', staff: 12, status: 'Active' },
    ];

    const filteredDepartments = departments.filter(dept =>
        dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dept.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6">
            <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <BuildingOffice2Icon className="h-8 w-8 text-indigo-600" />
                        Hospital Departments
                    </h1>
                    <p className="text-gray-600">Manage and view all hospital specialized units</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-md font-medium">
                    <PlusIcon className="h-5 w-5" />
                    Add Department
                </button>
            </div>

            {/* Search and Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search departments by name or code..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <select className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option>All Status</option>
                        <option>Active</option>
                        <option>Inactive</option>
                    </select>
                </div>
            </div>

            {/* Departments Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredDepartments.map((dept, index) => (
                    <div key={index} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition">
                                <BuildingOffice2Icon className="h-6 w-6 text-indigo-600" />
                            </div>
                            <span className="px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                                {dept.status}
                            </span>
                        </div>
                        <h3 className="font-bold text-gray-800 text-lg mb-1">{dept.name}</h3>
                        <p className="text-indigo-600 text-sm font-semibold mb-4">{dept.code} Unit</p>
                        
                        <div className="space-y-2 mb-6 text-sm text-gray-600">
                            <div className="flex justify-between">
                                <span>Head:</span>
                                <span className="text-gray-800 font-medium">{dept.head}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Total Staff:</span>
                                <span className="text-gray-800 font-medium">{dept.staff} Members</span>
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-gray-50 flex gap-2">
                            <button className="flex-1 px-3 py-1.5 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition text-sm font-medium">
                                View Details
                            </button>
                            <button className="px-3 py-1.5 text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition text-sm font-medium">
                                Edit
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {filteredDepartments.length === 0 && (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
                    <RectangleStackIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-800">No departments found</h3>
                    <p className="text-gray-500">Try adjusting your search criteria</p>
                </div>
            )}
        </div>
    );
};

export default Departments;
