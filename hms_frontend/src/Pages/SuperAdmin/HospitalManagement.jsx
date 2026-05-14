import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { FaCalendarAlt, FaCheckCircle, FaTimesCircle, FaHospital } from 'react-icons/fa';
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import Swal from 'sweetalert2';

const HospitalManagement = () => {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHospitals = useCallback(async (page, limit, search) => {
    try {
      setLoading(true);
      const res = await api.get('/api/v1/superadmin/hospitals');
      
      let filteredData = res.data;
      if (search) {
        const term = search.toLowerCase();
        filteredData = filteredData.filter(h => 
          (h.hospital_name || '').toLowerCase().includes(term) || 
          (h.hospital_code || '').toLowerCase().includes(term)
        );
      }

      setTotalItems(filteredData.length);
      setTotalPages(Math.ceil(filteredData.length / limit));
      
      const start = (page - 1) * limit;
      setHospitals(filteredData.slice(start, start + limit));
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      Swal.fire('Error', 'Failed to load hospitals', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHospitals(currentPage, itemsPerPage, searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentPage, itemsPerPage, searchTerm, fetchHospitals]);

  const handleToggleStatus = async (hospital) => {
    const newStatus = hospital.status === 'active' ? 'suspended' : 'active';
    const result = await Swal.fire({
      title: `Are you sure?`,
      text: `Do you want to ${newStatus} ${hospital.hospital_name}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: newStatus === 'active' ? '#10b981' : '#ef4444',
      confirmButtonText: `Yes, ${newStatus} it!`
    });

    if (result.isConfirmed) {
      try {
        await api.put(`/api/v1/superadmin/hospitals/${hospital.id}/status`, { status: newStatus });
        Swal.fire('Success', `Hospital has been ${newStatus}`, 'success');
        fetchHospitals(currentPage, itemsPerPage, searchTerm);
      } catch (error) {
        Swal.fire('Error', 'Failed to update status', 'error');
      }
    }
  };

  const handleUpdateSubscription = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const plan = formData.get('plan');
    const expiryDate = formData.get('expiryDate');

    try {
      await api.put(`/api/v1/superadmin/hospitals/${selectedHospital.id}/subscription`, { plan, expiryDate });
      Swal.fire('Updated!', 'Subscription plan updated successfully', 'success');
      setShowModal(false);
      fetchHospitals(currentPage, itemsPerPage, searchTerm);
    } catch (error) {
      Swal.fire('Error', 'Failed to update subscription', 'error');
    }
  };

  const columns = [
    {
      header: "#",
      render: (_, index) => (currentPage - 1) * itemsPerPage + index + 1,
    },
    { 
      header: "Hospital Info", 
      render: (row) => (
        <div>
          <div className="font-bold text-slate-800 text-base">{row.hospital_name}</div>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 uppercase tracking-tighter">
              {row.hospital_code}
            </span>
            • {row.email || 'No email'}
          </div>
        </div>
      )
    },
    { 
      header: "Plan", 
      render: (row) => (
        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
          row.subscription_plan === 'Enterprise' ? 'bg-amber-100 text-amber-700' :
          row.subscription_plan === 'Pro' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
        }`}>
          {row.subscription_plan}
        </span>
      )
    },
    { 
      header: "Expiry Date", 
      render: (row) => (
        <div className="flex items-center gap-2">
          <FaCalendarAlt className="text-slate-300" />
          {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : 'Lifetime'}
        </div>
      )
    },
    { 
      header: "Status", 
      render: (row) => (
        <span className={`flex items-center gap-1.5 font-bold ${row.status === 'active' ? 'text-emerald-500' : 'text-rose-500'}`}>
          {row.status === 'active' ? <FaCheckCircle size={14} /> : <FaTimesCircle size={14} />}
          {row.status.toUpperCase()}
        </span>
      )
    },
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      
      {/* Stats Summary Area (Optional - keeping some of the previous dashboard feel) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 rounded-xl text-2xl bg-indigo-50 text-indigo-600"><FaHospital /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Hospitals</p>
            <p className="text-2xl font-bold text-slate-800">{totalItems}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 rounded-xl text-2xl bg-emerald-50 text-emerald-600"><FaCheckCircle /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Active Plans</p>
            <p className="text-2xl font-bold text-slate-800">{hospitals.filter(h => h.status === 'active').length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 rounded-xl text-2xl bg-rose-50 text-rose-600"><FaTimesCircle /></div>
          <div>
            <p className="text-sm font-medium text-slate-500">Suspended</p>
            <p className="text-2xl font-bold text-slate-800">{hospitals.filter(h => h.status !== 'active').length}</p>
          </div>
        </div>
      </div>

      <DataTable
        title="Hospital Management"
        columns={columns}
        data={hospitals}
        loading={loading}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={(val) => { setItemsPerPage(parseInt(val)); setCurrentPage(1); }}
        onPageChange={(val) => setCurrentPage(val)}
        actions={(item) => (
          <TableActions
            item={item}
            onEdit={(it) => { setSelectedHospital(it); setShowModal(true); }}
            extraActions={[
              {
                key: "status",
                label: item.status === 'active' ? "Suspend" : "Activate",
                icon: item.status === 'active' ? <FaTimesCircle className="text-rose-500" /> : <FaCheckCircle className="text-emerald-500" />,
                onClick: handleToggleStatus,
              },
            ]}
          />
        )}
      />

      {/* Subscription Modal */}
      {showModal && selectedHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="bg-indigo-600 px-6 py-8 text-white relative">
              <button 
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition"
              >
                <FaTimesCircle size={24} />
              </button>
              <h2 className="text-2xl font-bold">Update Subscription</h2>
              <p className="text-indigo-100 text-sm mt-1">Managing {selectedHospital.hospital_name}</p>
            </div>
            
            <form onSubmit={handleUpdateSubscription} className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Select Plan</label>
                <select 
                  name="plan" 
                  defaultValue={selectedHospital.subscription_plan}
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 transition"
                >
                  <option value="Basic">Basic Plan</option>
                  <option value="Pro">Pro Plan</option>
                  <option value="Enterprise">Enterprise Plan</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Expiry Date</label>
                <input 
                  type="date" 
                  name="expiryDate" 
                  defaultValue={selectedHospital.expiry_date ? selectedHospital.expiry_date.split('T')[0] : ''}
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 transition"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 px-4 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HospitalManagement;
