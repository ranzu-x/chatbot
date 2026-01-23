import { CalendarDaysIcon, ChartBarIcon, RectangleStackIcon, UsersIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { FaRegMoneyBillAlt, FaFilePrescription } from 'react-icons/fa';
import { Link, useLocation } from 'react-router';

const Sidebar = () => {
    const location = useLocation();
    const isActive = (path) => location.pathname === path;


    const getLinkClass = (path) => {
        return `flex items-center px-4 py-2 rounded-lg ${isActive(path)
                ? 'text-gray-700 bg-gray-200'
                : 'text-gray-600 hover:bg-gray-100'
            }`;
    };


    return (
        <div>
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white flex flex-col">
                <div className='h-20 flex items-center justify-center border-b border-gray-200'>
                    <Link to={"/"} className="text-2xl font-bold text-indigo-600">
                        Hospital MS
                    </Link>
                </div>
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
                    <Link to={'/appointments'} className={getLinkClass('/appointments')}>
                        <CalendarDaysIcon className="h-5 w-5 mr-3" /> Appointments
                    </Link>
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
                    <Link to={'/slots/manage'} className={getLinkClass('/slots/manage')}>
                        <RectangleStackIcon className="h-5 w-5 mr-3" /> Manage Slots
                    </Link>

                </nav>
            </aside>
        </div>
    );
};

export default Sidebar;