import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import api from '../../services/api';
import { FaPrint } from 'react-icons/fa';
import { useAuth } from '../../Provider/AuthContexProvider';
import DataTable from "../../Components/Table Components/DataTable";
import TableActions from "../../Components/Table Components/TableActionButtons";
import Swal from 'sweetalert2';

const PrescriptionList = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDoctor = user?.roles?.some(role => role.toLowerCase() === 'doctor');

  const fetchPrescriptions = useCallback(async (page, limit, search) => {
    try {
      setLoading(true);
      // Using existing endpoint
      const res = await api.get('/api/v1/prescriptions');
      
      // Client-side filtering as the current backend doesn't seem to support search/pagination for prescriptions yet
      let filteredData = res.data;
      if (search) {
        const term = search.toLowerCase();
        filteredData = filteredData.filter(p => 
          (p.patient_name || '').toLowerCase().includes(term) || 
          (p.doctor_name || '').toLowerCase().includes(term)
        );
      }

      setTotalItems(filteredData.length);
      setTotalPages(Math.ceil(filteredData.length / limit));
      
      // Manual pagination
      const start = (page - 1) * limit;
      const paginatedData = filteredData.slice(start, start + limit);
      
      setPrescriptions(paginatedData);
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
      Swal.fire('Error', 'Failed to load prescriptions', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
        fetchPrescriptions(currentPage, itemsPerPage, searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentPage, itemsPerPage, searchTerm, fetchPrescriptions]);

  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "This prescription will be permanently deleted.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it!',
      confirmButtonColor: '#d33',
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/api/v1/prescriptions/${item.id}`);
        Swal.fire('Deleted!', 'Prescription deleted successfully', 'success');
        fetchPrescriptions(currentPage, itemsPerPage, searchTerm);
      } catch (error) {
        console.error('Error deleting prescription:', error);
        Swal.fire('Error', 'Failed to delete prescription', 'error');
      }
    }
  };

  const handleView = (item) => navigate(`/prescription/view/${item.id}`);
  const handlePrint = (item) => navigate(`/prescription/print/${item.id}`);

  const columns = [
    {
      header: "#",
      render: (_, index) => (currentPage - 1) * itemsPerPage + index + 1,
    },
    { 
      header: "Patient Name", 
      render: (row) => (
        <div>
          <div className="font-semibold text-gray-800">{row.patient_name || 'N/A'}</div>
          <div className="text-xs text-gray-400">ID: {row.patient_id}</div>
        </div>
      )
    },
    { header: "Doctor", accessor: "doctor_name" },
    { 
      header: "Date", 
      render: (row) => row.prescription_date ? new Date(row.prescription_date).toLocaleDateString() : 'N/A'
    },
    {
      header: "Items",
      render: (row) => (
        <span className="inline-flex items-center px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
          {row.item_count || 0} medicines
        </span>
      )
    }
  ];

  return (
    <div className="p-4 sm:p-8 font-poppins">
      <DataTable
        title="Prescription"
        columns={columns}
        data={prescriptions}
        loading={loading}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onAddNew={isDoctor ? () => navigate("/prescription/new") : null}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={(val) => { setItemsPerPage(parseInt(val)); setCurrentPage(1); }}
        onPageChange={(val) => setCurrentPage(val)}
        actions={(item) => (
          <TableActions
            item={item}
            onView={handleView}
            onDelete={isDoctor ? handleDelete : null}
            extraActions={[
              {
                key: "print",
                label: "Print",
                icon: <FaPrint className="text-green-600" />,
                onClick: handlePrint,
              },
            ]}
          />
        )}
      />
    </div>
  );
};

export default PrescriptionList;
