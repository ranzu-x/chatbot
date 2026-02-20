import { useRef } from 'react';
import { Printer, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const InvoiceLayout = ({
    hospitalInfo,
    billType,
    bill,
    patientInfo,
    doctorItems,
    labItems,
    medicineItems,
    subtotal,
    discountAmount,
    tax,
    grandTotal,
    invoiceNo,
    showActions
}) => {
    const invoiceRef = useRef();

    // Print function
    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Invoice - ${invoiceNo}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                        font-family: 'Inter', sans-serif;
                    }
                    body {
                        padding: 20px;
                        background: white;
                    }
                    .invoice-print {
                        max-width: 800px;
                        margin: 0 auto;
                        border: 1px solid #e5e7eb;
                        border-radius: 8px;
                        overflow: hidden;
                    }
                    .header {
                        background: linear-gradient(135deg, #1e40af, #1e3a8a);
                        color: white;
                        padding: 20px;
                        text-align: center;
                    }
                    .header h1 {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 5px;
                    }
                    .header p {
                        font-size: 14px;
                        opacity: 0.9;
                    }
                    .info-section {
                        padding: 20px;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    .grid-2 {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                    }
                    .info-group h4 {
                        color: #6b7280;
                        font-size: 12px;
                        text-transform: uppercase;
                        margin-bottom: 5px;
                    }
                    .info-group p {
                        font-weight: 500;
                    }
                    .items-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    .items-table th {
                        background: #f3f4f6;
                        padding: 12px;
                        text-align: left;
                        font-weight: 600;
                        font-size: 12px;
                        color: #374151;
                        border-bottom: 2px solid #e5e7eb;
                    }
                    .items-table td {
                        padding: 12px;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .summary {
                        padding: 20px;
                        border-top: 2px solid #e5e7eb;
                    }
                    .summary-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px 0;
                        border-bottom: 1px dashed #d1d5db;
                    }
                    .total-row {
                        border-top: 2px solid #1e40af;
                        margin-top: 10px;
                        padding-top: 15px;
                        font-weight: bold;
                        font-size: 18px;
                        color: #1e40af;
                    }
                    .footer {
                        text-align: center;
                        padding: 20px;
                        color: #6b7280;
                        font-size: 12px;
                        border-top: 1px solid #e5e7eb;
                    }
                    @media print {
                        body { padding: 0; }
                        .invoice-print { border: none; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="invoice-print">
                    <div class="header">
                        <h1>MEDICAL INVOICE</h1>
                        <p>${hospitalInfo?.hospital_name || ''}</p>
                    <p style="margin-top: 5px; font-size: 12px;">
                    ${hospitalInfo?.address || ''}, 
                    ${hospitalInfo?.city || ''}, 
                    ${hospitalInfo?.state || ''} 
                    ${hospitalInfo?.zip_code || ''}
                    </p>
                    <p style="font-size: 12px;">
                        Phone: ${hospitalInfo?.phone || 'N/A'} | 
                        Email: ${hospitalInfo?.email || 'N/A'}
                    </p>

                    </div>
                    
                    <div class="info-section">
                        <div class="grid-2">
                            <div class="info-group">
                                <h4>Invoice Number</h4>
                                <p>${invoiceNo}</p>
                                <h4 style="margin-top: 10px;">Date</h4>
                                <p>${new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })}</p>
                            </div>
                            <div class="info-group">
                                <h4>Bill Type</h4>
                                <p>${billType.charAt(0).toUpperCase() + billType.slice(1)}</p>
                                <h4 style="margin-top: 10px;">Patient ID</h4>
                                <p>${patientInfo.patientId || 'N/A'}</p>
                            </div>
                        </div>
                        
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                            <h4 style="color: #6b7280; font-size: 12px; margin-bottom: 10px;">Patient Information</h4>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                                <div>
                                    <div style="font-size: 11px; color: #6b7280;">Name</div>
                                    <div style="font-weight: 500;">${patientInfo.patientName || 'N/A'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: #6b7280;">Age / Gender</div>
                                    <div style="font-weight: 500;">${patientInfo.age || 'N/A'} / ${patientInfo.gender || 'N/A'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: #6b7280;">Phone</div>
                                    <div style="font-weight: 500;">${patientInfo.phone || 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="padding: 0 20px;">
                        <h4 style="color: #1e40af; font-size: 16px; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 2px solid #1e40af;">
                            Service Details
                        </h4>
                        <table class="items-table">
                            <thead>
                                <tr>
                                    ${billType === 'doctor' ? `
                                        <th>Description</th>
                                        <th class="text-right">Amount ($)</th>
                                    ` : billType === 'lab' ? `
                                        <th>Test Name</th>
                                        <th class="text-center">Qty</th>
                                        <th class="text-right">Unit Price</th>
                                        <th class="text-right">Amount ($)</th>
                                    ` : `
                                        <th>Medicine Name</th>
                                        <th class="text-center">Qty</th>
                                        <th class="text-right">Unit Price</th>
                                        <th class="text-right">Discount</th>
                                        <th class="text-right">Amount ($)</th>
                                    `}
                                </tr>
                            </thead>
                            <tbody>
                                ${billType === 'doctor' ? doctorItems.map(item => `
                                    <tr>
                                        <td>${item.service || 'Service'}</td>
                                        <td class="text-right">$${Number(item.amount).toFixed(2)}</td>
                                    </tr>
                                `).join('') : ''}
                                
                                ${billType === 'lab' ? labItems.map(item => `
                                    <tr>
                                        <td>${item.testName || 'Test'}</td>
                                        <td class="text-center">${item.quantity}</td>
                                        <td class="text-right">$${Number(item.rate).toFixed(2)}</td>
                                        <td class="text-right">$${Number(item.amount).toFixed(2)}</td>
                                    </tr>
                                `).join('') : ''}
                                
                                ${billType === 'medicine' ? medicineItems.map(item => `
                                    <tr>
                                        <td>${item.medicineName || 'Medicine'}</td>
                                        <td class="text-center">${item.quantity}</td>
                                        <td class="text-right">$${Number(item.rate).toFixed(2)}</td>
                                        <td class="text-right">$${Number(item.discount).toFixed(2)}</td>
                                        <td class="text-right">$${Number(item.amount).toFixed(2)}</td>
                                    </tr>
                                `).join('') : ''}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="summary">
                        <h4 style="color: #1e40af; font-size: 16px; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 2px solid #1e40af;">
                            Bill Summary
                        </h4>
                        <div style="max-width: 300px; margin-left: auto;">
                            <div class="summary-row">
                                <span>Subtotal:</span>
                                <span>$${subtotal.toFixed(2)}</span>
                            </div>
                            <div class="summary-row">
                                <span>Discount:</span>
                                <span style="color: #dc2626;">-$${discountAmount.toFixed(2)}</span>
                            </div>
                            <div class="summary-row">
                                <span>Tax (5%):</span>
                                <span>$${tax.toFixed(2)}</span>
                            </div>
                            <div class="summary-row total-row">
                                <span>GRAND TOTAL:</span>
                                <span>$${grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <div style="color: #1e40af; font-weight: 600; margin-bottom: 5px;">
                            Thank you for choosing City Hospital!
                        </div>
                        <div>This is a computer generated invoice and does not require a physical signature.</div>
                        <div style="margin-top: 10px; font-size: 10px;">
                            Email: billing@cityhospital.com | Website: www.cityhospital.com
                        </div>
                    </div>
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // PDF Download function
    const handleDownloadPDF = async () => {
        try {
            // Create a temporary div for the printable content
            const printContent = document.createElement('div');
            printContent.innerHTML = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #2563eb; margin: 0;">MEDICAL INVOICE</h1>
                   <h2 style="color: #4b5563; margin: 5px 0 0 0;">
    ${hospitalInfo?.hospitalName || ''}
</h2>
<p>
    ${hospitalInfo?.address || ''},
    ${hospitalInfo?.city || ''},
    ${hospitalInfo?.state || ''} ${hospitalInfo?.zipCode || ''}
</p>
<p>
    Phone: ${hospitalInfo?.phone || 'N/A'}
</p>

                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <div>
                            <strong>Invoice No:</strong> INV-${Date.now().toString().slice(-6)}
                        </div>
                        <div>
                            <strong>Date:</strong> ${new Date().toLocaleDateString()}
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px;">
                        Patient Information
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div><strong>Patient ID:</strong> ${patientInfo.patientId || 'N/A'}</div>
                        <div><strong>Name:</strong> ${patientInfo.patientName || 'N/A'}</div>
                        <div><strong>Age/Gender:</strong> ${patientInfo.age || 'N/A'} / ${patientInfo.gender || 'N/A'}</div>
                        <div><strong>Contact:</strong> ${patientInfo.phone || 'N/A'}</div>
                        <div><strong>Doctor:</strong> ${patientInfo.doctorName || 'N/A'}</div>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px;">
                        Bill Details
                    </h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #2563eb; color: white;">
                                <th style="padding: 10px; text-align: left;">Description</th>
                                <th style="padding: 10px; text-align: right;">Amount ($)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${billType === 'doctor' ? doctorItems.map(item => `
                                <tr style="border-bottom: 1px solid #e5e7eb;">
                                    <td style="padding: 10px;">${item.service || 'Service'}</td>
                                    <td style="padding: 10px; text-align: right;">$${Number(item.amount).toFixed(2)}</td>
                                </tr>
                            `).join('') : ''}
                            
                            ${billType === 'lab' ? labItems.map(item => `
                                <tr style="border-bottom: 1px solid #e5e7eb;">
                                    <td style="padding: 10px;">${item.testName || 'Test'}</td>
                                    <td style="padding: 10px; text-align: right;">$${Number(item.amount).toFixed(2)}</td>
                                </tr>
                            `).join('') : ''}
                            
                            ${billType === 'medicine' ? medicineItems.map(item => `
                                <tr style="border-bottom: 1px solid #e5e7eb;">
                                    <td style="padding: 10px;">${item.medicineName || 'Medicine'}</td>
                                    <td style="padding: 10px; text-align: right;">$${Number(item.amount).toFixed(2)}</td>
                                </tr>
                            `).join('') : ''}
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px;">
                        Bill Summary
                    </h3>
                    <div style="max-width: 300px; margin-left: auto;">
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1;">
                            <span>Subtotal:</span>
                            <span>$${subtotal.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1;">
                            <span>Discount:</span>
                            <span style="color: #dc2626;">-$${discountAmount.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1;">
                            <span>Tax (5%):</span>
                            <span>$${tax.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #2563eb; margin-top: 8px;">
                            <span style="font-weight: bold;">Grand Total:</span>
                            <span style="font-weight: bold; color: #2563eb;">$${grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280;">
                    <p>Thank you for choosing City Hospital!</p>
                    <p style="font-size: 12px;">This is a computer generated invoice</p>
                </div>
            </div>
        `;

            // Append to body (hidden)
            document.body.appendChild(printContent);

            // Create canvas from the content
            const canvas = await html2canvas(printContent, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true
            });

            // Remove the temporary element
            document.body.removeChild(printContent);

            // Create PDF
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 190; // A4 width in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgWidth, imgHeight);
            pdf.save(`invoice-${Date.now().toString().slice(-6)}.pdf`);

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
        }

        console.log("Patients Information:", patientInfo);
    };

    return (
        <div>
            {/* Action Buttons */}
            <div className="flex justify-end gap-3 mb-4">
                {showActions && (
                    <>
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition font-medium text-sm"
                        >
                            <Printer size={16} />
                            Print
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                        >
                            <Download size={16} />
                            Download PDF
                        </button>
                    </>)}
            </div>

            {/* Invoice Component with ref */}
            <div ref={invoiceRef} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="border-b border-gray-200 pb-4 mb-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Invoice Preview</h3>
                            <p className="text-sm text-gray-600">Professional bill format</p>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-semibold text-blue-600">{invoiceNo}</div>
                            <div className="text-sm text-gray-500">Invoice #</div>
                        </div>
                    </div>
                </div>
<div className="grid grid-cols-2 gap-10 mb-6 text-sm">

  {/* LEFT SIDE */}
  <div className="space-y-1">

    {/* Hospital Name */}
    <p className="font-semibold text-gray-900 mb-2">
      {hospitalInfo?.hospital_name || "Hospital Name"}
    </p>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span className="font-bold">Bill No</span>
      <span>:</span>
      <span className="font-bold">{invoiceNo}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span className="font-bold">UHID</span>
      <span>:</span>
      <span className="font-bold">{patientInfo.patientId || "N/A"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span className="font-bold">Patient Name</span>
      <span>:</span>
      <span className="font-bold">{patientInfo.patientName || "N/A"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>Referred By/Doctor</span>
      <span>:</span>
      <span>{patientInfo.referredDoctor || "N/A"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>Sponsor</span>
      <span>:</span>
      <span>{patientInfo.patientType || "Cash Patient"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>Department</span>
      <span>:</span>
      <span>{patientInfo.department || "N/A"}</span>
    </div>

  </div>


  {/* RIGHT SIDE */}
  <div className="space-y-1">

    {/* Spacer to match hospital name height */}
    <div className="h-[28px]" />

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>Bill Date/Time</span>
      <span>:</span>
      <span>{bill || "N/A"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>Gender</span>
      <span>:</span>
      <span>{patientInfo.gender || "N/A"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>Age</span>
      <span>:</span>
      <span>{patientInfo.age || "N/A"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>Phone</span>
      <span>:</span>
      <span>{patientInfo.phone || "N/A"}</span>
    </div>

    <div className="grid grid-cols-[170px_10px_1fr]">
      <span>App Date & Time</span>
      <span>:</span>
      <span>{patientInfo.appointmentDate || "N/A"}</span>
    </div>

  </div>

</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                {billType === 'doctor' && (
                                    <>
                                        <th className="py-3 px-4 text-left font-semibold text-gray-700">Service Description</th>
                                        <th className="py-3 px-4 text-right font-semibold text-gray-700">Amount</th>
                                    </>
                                )}
                                {billType === 'lab' && (
                                    <>
                                        <th className="py-3 px-4 text-left font-semibold text-gray-700">Test Name</th>
                                        <th className="py-3 px-4 text-center font-semibold text-gray-700">Qty</th>
                                        <th className="py-3 px-4 text-right font-semibold text-gray-700">Unit Price</th>
                                        <th className="py-3 px-4 text-right font-semibold text-gray-700">Amount</th>
                                    </>
                                )}
                                {billType === 'medicine' && (
                                    <>
                                        <th className="py-3 px-4 text-left font-semibold text-gray-700">Medicine Name</th>
                                        <th className="py-3 px-4 text-center font-semibold text-gray-700">Qty</th>
                                        <th className="py-3 px-4 text-right font-semibold text-gray-700">Unit Price</th>
                                        <th className="py-3 px-4 text-right font-semibold text-gray-700">Discount</th>
                                        <th className="py-3 px-4 text-right font-semibold text-gray-700">Amount</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {billType === 'doctor' && doctorItems.map((item) => (
                                <tr key={item.id}>
                                    <td className="py-3 px-4">{item.service || 'Consultation'}</td>
                                    <td className="py-3 px-4 text-right font-medium">${Number(item.amount).toFixed(2)}</td>
                                </tr>
                            ))}
                            {billType === 'lab' && labItems.map((item) => (
                                <tr key={item.id}>
                                    <td className="py-3 px-4">{item.testName || 'Test'}</td>
                                    <td className="py-3 px-4 text-center">{item.quantity}</td>
                                    <td className="py-3 px-4 text-right">${Number(item.rate).toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-medium">${Number(item.amount).toFixed(2)}</td>
                                </tr>
                            ))}
                            {billType === 'medicine' && medicineItems.map((item) => (
                                <tr key={item.id}>
                                    <td className="py-3 px-4">{item.medicineName || 'Medicine'}</td>
                                    <td className="py-3 px-4 text-center">{item.quantity}</td>
                                    <td className="py-3 px-4 text-right">${Number(item.rate).toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right text-red-600">-${Number(item.discount).toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-medium">${Number(item.amount).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 border-t border-gray-200 pt-6">
                    <div className="max-w-xs ml-auto">
                        <div className="flex justify-between py-2">
                            <span className="text-gray-600">Subtotal:</span>
                            <span className="font-medium">${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-gray-600">Discount:</span>
                            <span className="font-medium text-red-600">-${discountAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-gray-600">Tax (5%):</span>
                            <span className="font-medium">${tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-3 mt-2 border-t border-gray-200">
                            <span className="font-bold text-lg text-gray-800">Total:</span>
                            <span className="font-bold text-xl text-blue-600">${grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-6 text-center text-sm text-gray-500">
                    <p>Thank you for your business!</p>
                    <p className="mt-1">This invoice is computer generated and valid without signature.</p>
                </div>
            </div>
        </div>
    );
};

export default InvoiceLayout;