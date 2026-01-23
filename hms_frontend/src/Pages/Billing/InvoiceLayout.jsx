const InvoiceLayout = ({
    billType,
    patientInfo,
    doctorItems,
    labItems,
    medicineItems,
    subtotal,
    discountAmount,
    tax,
    grandTotal,
    invoiceNo,
}) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="border-b border-gray-200 pb-4 mb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">Invoice Preview</h3>
                        <p className="text-sm text-gray-600">Professional bill format</p>
                    </div>
                    <div className="text-right">
                        {/* <div className="text-lg font-semibold text-blue-600">{invoiceNumber}</div> */}
                        <div className="text-sm text-gray-500">{invoiceNo}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                    <h4 className="font-medium text-gray-700 mb-2">Bill From</h4>
                    <div className="text-sm">
                        <p className="font-semibold text-gray-900">City Hospital & Diagnostics</p>
                        <p className="text-gray-600">123 Medical Street</p>
                        <p className="text-gray-600">Health City, HC 12345</p>
                        <p className="text-gray-600">Phone: (555) 123-4567</p>
                    </div>
                </div>
                <div>
                    <h4 className="font-medium text-gray-700 mb-2">Bill To</h4>
                    <div className="text-sm">
                        <p className="font-semibold text-gray-900">{patientInfo.patientName || 'Patient Name'}</p>
                        <p className="text-gray-600">ID: {patientInfo.patientId || 'N/A'}</p>
                        <p className="text-gray-600">{patientInfo.address || 'Address'}</p>
                        <p className="text-gray-600">Phone: {patientInfo.phone || 'N/A'}</p>
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
    );
};

export default InvoiceLayout;
