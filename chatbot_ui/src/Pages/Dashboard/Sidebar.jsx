import { 
    LayoutDashboard, 
    Users, 
    ClipboardList, 
    Calendar, 
    CreditCard, 
    Building2, 
    Stethoscope, 
    UserPlus, 
    Clock, 
    Microscope, 
    FlaskConical, 
    Crown,
    Settings
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../Provider/AuthContexProvider';

const Sidebar = () => {
    const location = useLocation();
    const { user } = useAuth();
    const isSuperAdmin = user?.roles?.some(role => role.toLowerCase() === 'super_admin');
    const isHospitalAdmin = user?.roles?.some(role => role.toLowerCase() === 'hospital_admin');
    const isLabTech = user?.roles?.some(role => role.toLowerCase() === 'lab technician');
    
    const isActive = (path) => location.pathname === path;

    const getLinkClass = (path) => {
        const baseClass = "flex items-center px-4 py-3 rounded-xl transition-all duration-200 group mb-1";
        return isActive(path)
            ? `${baseClass} bg-slate-200 text-slate-900 font-bold`
            : `${baseClass} text-slate-500 hover:bg-slate-50 hover:text-slate-800`;
    };

    const iconClass = (path) => {
        return `h-5 w-5 mr-3 transition-colors duration-200 ${
            isActive(path) ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600'
        }`;
    };

    return (
        <div className="h-screen sticky top-0">
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white h-full flex flex-col border-r border-slate-100 shadow-sm">
                <div className='h-20 flex items-center px-8 border-b border-slate-50'>
                    <Link to={"/"} className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-xl">H</span>
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">
                            CareSync
                        </span>
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-4">
                        Main Menu
                    </div>
                    
                    <nav className="space-y-1">
                        <Link to={'/dashboard'} className={getLinkClass('/dashboard')}>
                            <LayoutDashboard className={iconClass('/dashboard')} /> 
                            <span className="font-medium text-sm">Dashboard</span>
                        </Link>
                        
                        <Link to={'/patients'} className={getLinkClass('/patients')}>
                            <Users className={iconClass('/patients')} /> 
                            <span className="font-medium text-sm">Patients</span>
                        </Link>
                        
                        <Link to={'/prescription'} className={getLinkClass('/prescription')}>
                            <ClipboardList className={iconClass('/prescription')} /> 
                            <span className="font-medium text-sm">Prescriptions</span>
                        </Link>
                        
                        <Link to={'/appointments'} className={getLinkClass('/appointments')}>
                            <Calendar className={iconClass('/appointments')} /> 
                            <span className="font-medium text-sm">Appointments</span>
                        </Link>
                        
                        <Link to={'/billing'} className={getLinkClass('/billing')}>
                            <CreditCard className={iconClass('/billing')} /> 
                            <span className="font-medium text-sm">Billing</span>
                        </Link>
                        
                        <Link to={'/departments'} className={getLinkClass('/departments')}>
                            <Building2 className={iconClass('/departments')} /> 
                            <span className="font-medium text-sm">Departments</span>
                        </Link>

                        <div className="pt-4 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">
                            Management
                        </div>

                        <Link to={'/users'} className={getLinkClass('/users')}>
                            <Stethoscope className={iconClass('/users')} /> 
                            <span className="font-medium text-sm">Medical Staff</span>
                        </Link>
                        
                        <Link to={'/adduser'} className={getLinkClass('/adduser')}>
                            <UserPlus className={iconClass('/adduser')} /> 
                            <span className="font-medium text-sm">Add New Staff</span>
                        </Link>
                        
                        <Link to={'/slots/manage'} className={getLinkClass('/slots/manage')}>
                            <Clock className={iconClass('/slots/manage')} /> 
                            <span className="font-medium text-sm">Manage Slots</span>
                        </Link>

                        {isHospitalAdmin && (
                            <Link to={'/services'} className={getLinkClass('/services')}>
                                <Microscope className={iconClass('/services')} /> 
                                <span className="font-medium text-sm">Tests & Services</span>
                            </Link>
                        )}

                        {(isLabTech || isHospitalAdmin) && (
                            <Link to={'/lab-dashboard'} className={getLinkClass('/lab-dashboard')}>
                                <FlaskConical className={iconClass('/lab-dashboard')} /> 
                                <span className="font-medium text-sm">Laboratory</span>
                            </Link>
                        )}

                        {isSuperAdmin && (
                            <>
                                <div className="pt-4 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">
                                    System Admin
                                </div>
                                <Link to={'/superadmin/hospitals'} className={getLinkClass('/superadmin/hospitals')}>
                                    <Crown className={`${iconClass('/superadmin/hospitals')} ${isActive('/superadmin/hospitals') ? '' : 'text-amber-500'}`} /> 
                                    <span className={`font-medium text-sm ${isActive('/superadmin/hospitals') ? 'text-slate-900' : 'text-amber-600'}`}>SaaS Hospitals</span>
                                </Link>
                            </>
                        )}
                    </nav>
                </div>

                <div className="p-4 border-t border-slate-50">
                    <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                            {user?.first_name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">
                                {user?.first_name} {user?.last_name}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate capitalize">
                                {user?.roles?.[0] || 'User'}
                            </p>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    );
};

export default Sidebar;