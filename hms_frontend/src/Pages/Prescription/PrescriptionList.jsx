import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import api from '../../services/api';
import { FaFilePrescription, FaEye, FaTrash, FaPrint, FaPlus, FaSearch } from 'react-icons/fa';

const PrescriptionList = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const fetchPrescriptions = async () => {
    try {
      const res = await api.get('/api/v1/prescriptions');
      setPrescriptions(res.data);
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this prescription?')) return;
    try {
      await api.delete(`/api/v1/prescriptions/${id}`);
      setPrescriptions(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting prescription:', error);
      alert('Failed to delete prescription.');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const filtered = prescriptions.filter(p => {
    const term = searchTerm.toLowerCase();
    const patientName = (p.patient_name || '').toLowerCase();
    const doctorName = (p.doctor_name || '').toLowerCase();
    return patientName.includes(term) || doctorName.includes(term);
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Loading prescriptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <FaFilePrescription className="text-indigo-600 text-3xl" />
            Prescriptions
          </h1>
          <p className="text-gray-500 mt-1">Manage and view all patient prescriptions</p>
        </div>
        <Link
          to="/prescription/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-md font-medium"
        >
          <FaPlus className="text-sm" />
          New Prescription
        </Link>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by patient or doctor name..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">#</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">Patient Name</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">Doctor</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-600">Items</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-gray-500 font-medium">{idx + 1}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-800">{p.patient_name || 'N/A'}</div>
                      <div className="text-xs text-gray-400">ID: {p.patient_id}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{p.doctor_name || 'N/A'}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDate(p.prescription_date)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
                        {p.item_count || 0} medicines
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => navigate(`/prescription/view/${p.id}`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="View"
                        >
                          <FaEye size={15} />
                        </button>
                        <button
                          onClick={() => navigate(`/prescription/print/${p.id}`)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                          title="Print"
                        >
                          <FaPrint size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <FaFilePrescription className="mx-auto text-5xl text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No prescriptions found</h3>
          <p className="text-gray-400 mt-1">
            {searchTerm ? 'Try adjusting your search' : 'Create your first prescription to get started'}
          </p>
          {!searchTerm && (
            <Link
              to="/prescription/new"
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
            >
              <FaPlus /> Create Prescription
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default PrescriptionList;
