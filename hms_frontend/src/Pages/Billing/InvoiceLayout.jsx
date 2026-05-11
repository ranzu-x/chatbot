import { useRef } from 'react';
import { Printer, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useReactToPrint } from 'react-to-print';

const InvoiceLayout = ({
    hospitalInfo,
    billType,
    patientInfo,
    appointmentInfo,
    doctorItems,
    labItems,
    medicineItems,
    subtotal,
    discountAmount,
    tax,
    grandTotal,
    paid,
    invoiceNo,
    showActions
}) => {
    const invoiceRef = useRef();
    const formatMoney = (value) => Number(value ?? 0).toFixed(2);

    // Improved Print function using react-to-print
    const handlePrint = useReactToPrint({
        contentRef: invoiceRef,
        documentTitle: `Invoice-${invoiceNo}`,
    });

    // PDF Download function
    const handleDownloadPDF = async () => {
        try {
            if (!invoiceRef.current) return;

            // Capture the element with html2canvas
            const canvas = await html2canvas(invoiceRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
            });

            const imgData = canvas.toDataURL("image/jpeg", 1.0);
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const imgWidth = 190; 
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            pdf.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);
            pdf.save(`Bill-${invoiceNo || "Receipt"}.pdf`);

        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("Failed to generate PDF. Please try the 'Print' button as an alternative.");
        }
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
                            <span>{patientInfo.doctorName || "N/A"}</span>
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
                            <span>{patientInfo.billDate ?? "N/A"}</span>
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
                            <span>
                                {appointmentInfo?.appointment_date
                                    ? appointmentInfo.appointment_time
                                        ? `${appointmentInfo.appointment_date} ${appointmentInfo.appointment_time}`
                                        : appointmentInfo.appointment_date
                                    : "N/A"}
                            </span>
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
                                        <th className="py-3 px-4 text-right font-semibold text-gray-700">Units</th>
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
                                    <td className="py-3 px-4 text-center">1</td>
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
                            <span className="font-medium">${formatMoney(subtotal)}</span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-gray-600">Discount:</span>
                            <span className="font-medium text-red-600">-${formatMoney(discountAmount)}</span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-gray-600">Tax (5%):</span>
                            <span className="font-medium">${formatMoney(tax)}</span>
                        </div>
                        <div className="flex justify-between py-2  border-t border-gray-200">
                            <span className="font-bold  text-gray-800">Billed Amount:</span>
                            <span className="font-bold  text-blue-600">${formatMoney(grandTotal)}</span>
                        </div>
                        <div className="flex justify-between py-2 border-t border-gray-200">
                            <span className="font-bold  text-gray-800">Net Amount Received:</span>
                            <span className="font-bold  text-blue-600">${formatMoney(paid || 0)}</span>
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