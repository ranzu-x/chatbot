import React, { useEffect, useState } from 'react';
import { X, User, Mail, Phone, Calendar, Briefcase, GraduationCap, Stethoscope, MapPin, Camera } from 'lucide-react';
import api from '../services/api';

const StaffViewModal = ({ isOpen, onClose, staffId }) => {
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && staffId) {
      const fetchStaffDetails = async () => {
        setLoading(true);
        try {
          const res = await api.get(`/api/v1/users/${staffId}`, { withCredentials: true });
          setStaff(res.data);
        } catch (error) {
          console.error("Error fetching staff details:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchStaffDetails();
    }
  }, [isOpen, staffId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <User className="w-6 h-6 text-indigo-600" />
            Staff Member Details
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : staff ? (
          <div className="p-6 space-y-8">
            {/* Profile Section */}
            <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-gray-50">
              <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center overflow-hidden border-2 border-indigo-100">
                {staff.profile_image ? (
                  <img 
                    src={`http://localhost:5000/uploads/profile/${staff.profile_image}`} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Camera className="w-10 h-10 text-indigo-200" />
                )}
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-2xl font-bold text-gray-900">{staff.first_name} {staff.last_name}</h3>
                <span className="inline-block px-3 py-1 mt-1 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-full capitalize">
                  {staff.role_name}
                </span>
              </div>
            </div>

            {/* Information Grid */}
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
              <InfoItem icon={<Mail className="w-4 h-4" />} label="Email" value={staff.email} />
              <InfoItem icon={<Phone className="w-4 h-4" />} label="Phone" value={staff.phone} />
              <InfoItem icon={<User className="w-4 h-4" />} label="Gender" value={staff.gender} className="capitalize" />
              <InfoItem icon={<Calendar className="w-4 h-4" />} label="Date of Birth" value={staff.date_of_birth ? new Date(staff.date_of_birth).toLocaleDateString() : 'N/A'} />
              <InfoItem icon={<Briefcase className="w-4 h-4" />} label="Department" value={staff.department || 'N/A'} />
              <InfoItem icon={<GraduationCap className="w-4 h-4" />} label="Qualification" value={staff.qualification || 'N/A'} />
              
              {staff.role_name === 'doctor' && (
                <InfoItem icon={<Stethoscope className="w-4 h-4" />} label="Specialization" value={staff.specialization || 'N/A'} />
              )}
            </div>

            {/* Address */}
            <div className="bg-gray-50 rounded-xl p-4 flex gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Address</p>
                <p className="text-sm text-gray-700 leading-relaxed">{staff.address || 'No address provided.'}</p>
              </div>
            </div>

            {/* Doctor Fees Section */}
            {staff.role_name === 'doctor' && staff.services && staff.services.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                  Consultation Fees
                </h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  {staff.services.map((service, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg bg-white shadow-sm">
                      <span className="text-sm text-gray-600">{service.service_name || 'Service'}</span>
                      <span className="text-sm font-bold text-indigo-600">${service.fee}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Emergency Contact */}
            {staff.emergency_contact && (
              <div className="pt-4 border-t border-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Emergency Contact</p>
                <p className="text-sm font-medium text-red-600">{staff.emergency_contact}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            No data found for this staff member.
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-all shadow-md active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const InfoItem = ({ icon, label, value, className = "" }) => (
  <div className="flex gap-3 items-start">
    <div className="mt-1 p-1.5 bg-gray-50 rounded-md text-gray-400">
      {icon}
    </div>
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-gray-900 font-medium ${className}`}>{value}</p>
    </div>
  </div>
);

export default StaffViewModal;
