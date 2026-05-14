import { CalendarDaysIcon, ChartBarIcon, RectangleStackIcon, UsersIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { FaRegMoneyBillAlt, FaFilePrescription } from 'react-icons/fa';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../Provider/AuthContexProvider';
import { FaCrown, FaMicroscope, FaFlask } from 'react-icons/fa';

const Sidebar = () => {
    const location = useLocation();
    const { user } = useAuth();
    const isSuperAdmin = user?.roles?.some(role => role.toLowerCase() === 'super_admin');
    const isHospitalAdmin = user?.roles?.some(role => role.toLowerCase() === 'hospital_admin');
    const isLabTech = user?.roles?.some(role => role.toLowerCase() === 'lab technician');
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
                    {isHospitalAdmin && (
                        <Link to={'/services'} className={getLinkClass('/services')}>
                            <FaMicroscope className="h-5 w-5 mr-3" /> Tests & Services
                        </Link>
                    )}
                    {(isLabTech || isHospitalAdmin) && (
                        <Link to={'/lab-dashboard'} className={getLinkClass('/lab-dashboard')}>
                            <FaFlask className="h-5 w-5 mr-3" /> Laboratory
                        </Link>
                    )}
                    {isSuperAdmin && (
                        <Link to={'/superadmin/hospitals'} className={getLinkClass('/superadmin/hospitals')}>
                            <FaCrown className="h-5 w-5 mr-3 text-amber-500" /> Hospitals (SaaS)
                        </Link>
                    )}

                </nav>
            </aside>
        </div>
    );
};

export default Sidebar;