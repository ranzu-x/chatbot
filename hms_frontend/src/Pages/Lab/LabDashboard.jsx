import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import Swal from 'sweetalert2';
import { FaFlask, FaCheckCircle, FaHistory, FaEdit, FaClipboardList } from 'react-icons/fa';

const LabDashboard = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchReports = useCallback(async (page, limit, search, tab) => {
    try {
      setLoading(true);
      const endpoint = tab === 'pending' ? '/api/v1/lab/pending' : '/api/v1/lab/history';
      const res = await api.get(endpoint);
      
      let filteredData = res.data;
      if (search) {
        const term = search.toLowerCase();
        filteredData = filteredData.filter(r => 
          (r.patient_first_name || '').toLowerCase().includes(term) || 
          (r.patient_last_name || '').toLowerCase().includes(term) ||
          (r.test_name || '').toLowerCase().includes(term)
        );
      }

      setTotalItems(filteredData.length);
      setTotalPages(Math.ceil(filteredData.length / limit));
      
      const start = (page - 1) * limit;
      setReports(filteredData.slice(start, start + limit));
    } catch (error) {
      console.error('Error fetching lab reports:', error);
      Swal.fire('Error', 'Failed to load reports', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReports(currentPage, itemsPerPage, searchTerm, activeTab);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentPage, itemsPerPage, searchTerm, activeTab, fetchReports]);

  const handleSubmitResults = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      result_data: { value: formData.get('resultValue'), unit: formData.get('unit') },
      observations: formData.get('observations')
    };

    try {
      await api.put(`/api/v1/lab/reports/${selectedReport.id}`, data);
      Swal.fire('Submitted!', 'Lab report has been completed', 'success');
      setShowModal(false);
      fetchReports(currentPage, itemsPerPage, searchTerm, activeTab);
    } catch (error) {
      Swal.fire('Error', 'Failed to submit report', 'error');
    }
  };

  const columns = [
    {
      header: "#",
      render: (_, index) => (currentPage - 1) * itemsPerPage + index + 1,
    },
    { 
      header: "Patient", 
      render: (row) => `${row.patient_first_name} ${row.patient_last_name}`
    },
    { header: "Test Ordered", accessor: "test_name" },
    { 
      header: "Doctor", 
      render: (row) => `Dr. ${row.doctor_first_name} ${row.doctor_last_name}`
    },
    { 
      header: "Date", 
      render: (row) => new Date(row.created_at).toLocaleDateString()
    },
    { 
      header: "Status", 
      render: (row) => (
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          row.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {row.status.toUpperCase()}
        </span>
      )
    }
  ];

  if (activeTab === 'completed') {
    columns.push({
      header: "Result",
      render: (row) => {
        const data = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
        return `${data?.value || 'N/A'} ${data?.unit || ''}`;
      }
    });
  }

  return (
    <div className="p-4 sm:p-8 font-poppins">
      
      {/* Tab Switcher */}
      <div className="flex gap-4 mb-6 bg-slate-100 p-1 rounded-2xl w-fit">
        <button 
          onClick={() => { setActiveTab('pending'); setCurrentPage(1); }}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition ${activeTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <FaClipboardList /> Pending Tests
        </button>
        <button 
          onClick={() => { setActiveTab('completed'); setCurrentPage(1); }}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition ${activeTab === 'completed' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <FaHistory /> Lab History
        </button>
      </div>

      <DataTable
        title={activeTab === 'pending' ? "Active Lab Requests" : "Lab Report History"}
        columns={columns}
        data={reports}
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
            extraActions={item.status === 'pending' ? [
              {
                key: "fill",
                label: "Fill Results",
                icon: <FaEdit className="text-indigo-600" />,
                onClick: (row) => { setSelectedReport(row); setShowModal(true); },
              },
            ] : [
                {
                  key: "view",
                  label: "View Report",
                  icon: <FaCheckCircle className="text-emerald-500" />,
                  onClick: (row) => Swal.fire('Report Info', `Observations: ${row.observations || 'None'}`, 'info'),
                }
            ]}
          />
        )}
      />

      {/* Result Entry Modal */}
      {showModal && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-indigo-600 px-6 py-8 text-white">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <FaFlask /> Enter Test Results
              </h2>
              <p className="text-indigo-100 mt-1">{selectedReport.test_name} for {selectedReport.patient_first_name}</p>
            </div>
            
            <form onSubmit={handleSubmitResults} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Result Value</label>
                  <input name="resultValue" required className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50" placeholder="e.g. 12.5" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Unit</label>
                  <input name="unit" required className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50" placeholder="e.g. g/dL" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Observations / Remarks</label>
                <textarea name="observations" className="w-full p-3 border border-slate-200 rounded-xl outline-none bg-slate-50 h-24" placeholder="Abnormal findings, etc." />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 px-4 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition">Cancel</button>
                <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg transition">Submit Report</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabDashboard;
