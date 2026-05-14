import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import Swal from 'sweetalert2';
import { FaMicroscope, FaTimesCircle } from 'react-icons/fa';

const ServicesList = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  const fetchServices = useCallback(async (page, limit, search) => {
    try {
      setLoading(true);
      const res = await api.get('/api/v1/services');
      
      let filteredData = res.data;
      if (search) {
        const term = search.toLowerCase();
        filteredData = filteredData.filter(s => 
          (s.service_name || '').toLowerCase().includes(term) || 
          (s.description || '').toLowerCase().includes(term)
        );
      }

      setTotalItems(filteredData.length);
      setTotalPages(Math.ceil(filteredData.length / limit));
      
      const start = (page - 1) * limit;
      setServices(filteredData.slice(start, start + limit));
    } catch (error) {
      console.error('Error fetching services:', error);
      Swal.fire('Error', 'Failed to load services', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchServices(currentPage, itemsPerPage, searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentPage, itemsPerPage, searchTerm, fetchServices]);

  const handleSaveService = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      service_name: formData.get('service_name'),
      price: formData.get('price'),
      description: formData.get('description'),
      is_active: 1
    };

    try {
      if (selectedService) {
        await api.put(`/api/v1/services/${selectedService.id}`, data);
        Swal.fire('Updated!', 'Test/Service updated successfully', 'success');
      } else {
        await api.post('/api/v1/services', data);
        Swal.fire('Created!', 'New Test/Service added', 'success');
      }
      setShowModal(false);
      fetchServices(currentPage, itemsPerPage, searchTerm);
    } catch (error) {
      Swal.fire('Error', 'Failed to save service', 'error');
    }
  };

  const columns = [
    {
      header: "#",
      render: (_, index) => (currentPage - 1) * itemsPerPage + index + 1,
    },
    { header: "Test/Service Name", accessor: "service_name" },
    { header: "Description", accessor: "description" },
    { 
      header: "Price", 
      render: (row) => <span className="font-bold text-indigo-600">${parseFloat(row.price || 0).toFixed(2)}</span>
    },
    { 
      header: "Status", 
      render: (row) => (
        <span className={`px-2 py-1 rounded text-xs font-bold ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {row.is_active ? 'ACTIVE' : 'INACTIVE'}
        </span>
      )
    }
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      <DataTable
        title="Hospital Tests & Services"
        columns={columns}
        data={services}
        loading={loading}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onAddNew={() => { setSelectedService(null); setShowModal(true); }}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={(val) => { setItemsPerPage(parseInt(val)); setCurrentPage(1); }}
        onPageChange={(val) => setCurrentPage(val)}
        actions={(item) => (
          <TableActions
            item={item}
            onEdit={(it) => { setSelectedService(it); setShowModal(true); }}
            // We don't have a hard delete for services in backend yet, we'll just use Edit to disable
          />
        )}
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="bg-indigo-600 px-6 py-8 text-white relative">
              <button 
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition"
              >
                <FaTimesCircle size={24} />
              </button>
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <FaMicroscope />
                {selectedService ? 'Update Test' : 'Add New Test'}
              </h2>
            </div>
            
            <form onSubmit={handleSaveService} className="p-8 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Test Name</label>
                <input 
                  name="service_name" 
                  defaultValue={selectedService?.service_name || ''}
                  required
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. CBC, X-Ray Chest"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Price ($)</label>
                <input 
                  type="number"
                  step="0.01"
                  name="price" 
                  defaultValue={selectedService?.price || ''}
                  required
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Description</label>
                <textarea 
                  name="description" 
                  defaultValue={selectedService?.description || ''}
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:ring-2 focus:ring-indigo-500 h-24"
                  placeholder="Brief details about the test..."
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
                  className="flex-1 py-3 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg transition"
                >
                  {selectedService ? 'Save Changes' : 'Create Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesList;
