import { CalendarDaysIcon, ChartBarIcon, RectangleStackIcon, UsersIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { FaRegMoneyBillAlt, FaFilePrescription } from 'react-icons/fa';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';

const Sidebar = () => {
    const location = useLocation();
    const [appointmentsOpen, setAppointmentsOpen] = useState(false);

    const isActive = (path) => location.pathname === path;
    const isParentActive = (path) => location.pathname.startsWith(path);

    const getLinkClass = (path) => {
        return `flex items-center px-4 py-2 rounded-lg ${
            isActive(path)
                ? 'text-gray-700 bg-gray-200'
                : 'text-gray-600 hover:bg-gray-100'
        }`;
    };

    const getSubLinkClass = (path) => {
        return `flex items-center px-4 py-2 text-sm rounded-lg ${
            isActive(path)
                ? 'text-gray-700 bg-gray-200'
                : 'text-gray-600 hover:bg-gray-100'
        }`;
    };

    return (
        <div>
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white flex flex-col">
                <Link to={"/"} className="p-6 text-2xl font-bold text-indigo-600 border-b">
                    Hospital MS
                </Link>
                <nav className="flex-1 p-4 space-y-2">
                    <Link to={'/dashboard'} className={getLinkClass('/dashboard')}>
                        <ChartBarIcon className="h-5 w-5 mr-3" /> Dashboard
                    </Link>
                    <Link to={'/patients'} className={getLinkClass('/patients')}>
                        <UsersIcon className="h-5 w-5 mr-3" /> Patients
                    </Link>
                    <Link to={'/prescription'} className={getLinkClass('/prescription')}>
                        <FaFilePrescription className="h-5 w-5 mr-3" /> Prescription
                    </Link>

                    {/* Appointments Dropdown */}
                    <div>
                        <button
                            onClick={() => setAppointmentsOpen(!appointmentsOpen)}
                            className={`flex items-center justify-between w-full px-4 py-2 rounded-lg ${
                                isParentActive('/appointments')
                                    ? 'text-gray-700 bg-gray-200'
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            <div className="flex items-center">
                                <CalendarDaysIcon className="h-5 w-5 mr-3" />
                                Appointments
                            </div>
                            {appointmentsOpen ? (
                                <ChevronUpIcon className="h-4 w-4" />
                            ) : (
                                <ChevronDownIcon className="h-4 w-4" />
                            )}
                        </button>

                        {/* Submenu */}
                        {appointmentsOpen && (
                            <div className="ml-8 mt-2 space-y-1">
                                <Link to={'/appointments'} className={getSubLinkClass('/appointments')}>
                                    Appointment List
                                </Link>
                                <Link to={'/appointments/new'} className={getSubLinkClass('/appointments/new')}>
                                    Create Appointment
                                </Link>
                            </div>
                        )}
                    </div>

                    <Link to={'/billing'} className={getLinkClass('/billing')}>
                        <FaRegMoneyBillAlt className="h-5 w-5 mr-3" /> Billing
                    </Link>
                    <Link to={'/departments'} className={getLinkClass('/departments')}>
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Departments
                    </Link>
                    <Link to={'/users'} className={getLinkClass('/users')}>
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Doctors
                    </Link>
                    <Link to={'/adduser'} className={getLinkClass('/adduser')}>
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Add User
                    </Link>
                </nav>
            </aside>
        </div>
    );
};

export default Sidebar;