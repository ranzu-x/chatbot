import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import api from '../../services/api';
import { useAuth } from '../../Provider/AuthContexProvider';
import { useReactToPrint } from 'react-to-print';
import { FaPrint, FaArrowLeft } from 'react-icons/fa';

const PrescriptionView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const printRef = useRef();

  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Prescription-${id}`,
  });

  useEffect(() => {
    fetchPrescription();
  }, [id]);

  const fetchPrescription = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/v1/prescriptions/${id}`);
      setPrescription(res.data);
    } catch (error) {
      console.error('Error fetching prescription:', error);
      setPrescription(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!prescription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 text-lg">Prescription not found</p>
          <button onClick={() => navigate('/prescription')} className="mt-4 text-indigo-600 hover:underline">
            ← Back to list
          </button>
        </div>
      </div>
    );
  } and 

  const { doctor, patient, vitals, tests, medicines, prescription_date } = prescription;

  const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Action bar */}
      <div className="max-w-5xl mx-auto mb-4 flex justify-between items-center">
        <button
          onClick={() => navigate('/prescription')}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition font-medium"
        >
          <FaArrowLeft /> Back to List
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow-md"
        >
          <FaPrint /> Print Prescription
        </button>
      </div>

      {/* ═══════════════════════════════════════════
          PROFESSIONAL PRESCRIPTION LAYOUT
      ═══════════════════════════════════════════ */}
      <div ref={printRef} className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">

        {/* ── TOP HEADER BAR ── */}
        <div className="bg-gradient-to-r from-indigo-700 to-blue-600 px-8 py-5 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-wide">
                {user?.hospital_name || doctor?.clinic || 'Hospital Name'}
              </h1>
              <p className="text-indigo-100 text-sm mt-1">Medical Prescription</p>
            </div>
            <div className="text-right text-sm text-indigo-100">
              <p className="font-semibold text-white text-lg">Rx</p>
              <p>Date: {formatDate(prescription_date)}</p>
            </div>
          </div>
        </div>

        {/* ── DOCTOR & PATIENT INFO STRIP ── */}
        <div className="px-8 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Prescribing Doctor</p>
              <p className="font-bold text-gray-800 text-lg">{doctor?.name || 'N/A'}</p>
              <p className="text-sm text-gray-500">{doctor?.specialization || ''}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Patient Information</p>
              <p className="font-bold text-gray-800 text-lg">{patient?.name || 'N/A'}</p>
              <p className="text-sm text-gray-500">
                Age: {patient?.age || 'N/A'} &nbsp;|&nbsp; Gender: {patient?.gender || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* ═══ MAIN BODY: LEFT PANEL (Vitals + Tests) | RIGHT PANEL (Rx Medicines) ═══ */}
        <div className="flex min-h-[500px]">

          {/* ── LEFT PANEL: Vitals & Investigations ── */}
          <div className="w-[280px] border-r border-gray-200 bg-slate-50 p-6 flex flex-col">

            {/* Vitals Section */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs font-bold">♥</span>
                Vitals
              </h3>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Blood Pressure</span>
                  <span className="text-sm font-bold text-gray-800">{vitals?.bp || '—'}</span>
                </div>
                <div className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Pulse</span>
                  <span className="text-sm font-bold text-gray-800">{vitals?.pulse ? `${vitals.pulse} bpm` : '—'}</span>
                </div>
                <div className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Temperature</span>
                  <span className="text-sm font-bold text-gray-800">{vitals?.temperature ? `${vitals.temperature}°F` : '—'}</span>
                </div>
                <div className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-gray-100">
                  <span className="text-xs font-medium text-gray-500">SpO₂</span>
                  <span className="text-sm font-bold text-gray-800">{vitals?.spo2 ? `${vitals.spo2}%` : '—'}</span>
                </div>
                <div className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Weight</span>
                  <span className="text-sm font-bold text-gray-800">{vitals?.weight ? `${vitals.weight} kg` : '—'}</span>
                </div>
                <div className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Height</span>
                  <span className="text-sm font-bold text-gray-800">{vitals?.height ? `${vitals.height} cm` : '—'}</span>
                </div>
              </div>
            </div>

            {/* Chief Complaint */}
            {vitals?.chief_complaint && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Chief Complaint</h3>
                <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-100 leading-relaxed">
                  {vitals.chief_complaint}
                </p>
              </div>
            )}

            {/* Diagnosis */}
            {vitals?.diagnosis && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Diagnosis</h3>
                <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-100 leading-relaxed">
                  {vitals.diagnosis}
                </p>
              </div>
            )}

            {/* Tests / Investigations */}
            <div className="mt-auto">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">🔬</span>
                Investigations
              </h3>
              {tests && tests.length > 0 ? (
                <ul className="space-y-1.5">
                  {tests.map((test, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm bg-white px-3 py-2 rounded-lg border border-gray-100">
                      <span className="text-blue-500 font-bold mt-0.5">•</span>
                      <span className="text-gray-700">{test}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 italic">No tests ordered</p>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL: Rx — Medicines ── */}
          <div className="flex-1 p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-4xl font-serif text-indigo-600 font-bold leading-none">℞</span>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Medicines</h2>
                <p className="text-xs text-gray-400">Prescribed medications and instructions</p>
              </div>
            </div>

            {medicines && medicines.length > 0 ? (
              <div className="space-y-4">
                {medicines.map((med, idx) => (
                  <div key={idx} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition bg-white">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="font-bold text-gray-800 text-base">{med.medication_name || med.medicationName || 'Medication'}</h4>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {med.dosage} — {med.frequency || med.doseInterval}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                        {med.duration || med.doseDuration || '—'}
                      </span>
                    </div>
                    {(med.instructions || med.time) && (
                      <p className="text-xs text-gray-400 mt-2 ml-10 italic">
                        📋 {med.instructions || med.time}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-10">No medicines prescribed</p>
            )}

            {/* Advice / Notes */}
            {vitals?.advice && (
              <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <h4 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2">Doctor's Advice</h4>
                <p className="text-sm text-amber-800 leading-relaxed">{vitals.advice}</p>
              </div>
            )}

            {/* Follow-up */}
            {vitals?.follow_up && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <h4 className="text-xs font-bold text-green-700 uppercase tracking-widest mb-2">Follow-up</h4>
                <p className="text-sm text-green-800">{vitals.follow_up}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="border-t border-gray-200 px-8 py-4 bg-gray-50 flex justify-between items-center">
          <p className="text-xs text-gray-400">This prescription is computer generated and valid without signature.</p>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-700">{doctor?.name}</p>
            <p className="text-xs text-gray-400">Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionView;
