import { useRef } from 'react';
import { Printer, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const InvoiceLayout = ({
    hospitalInfo,
    billType,
    bill,
    patientInfo,
    appointmentInfo,
    doctorItems,
    labItems,
    medicineItems,
    subtotal,
    discountAmount,
    tax,
    grandTotal,
    invoiceNo,
    showActions,
    paymentMode = 'Credit Card',
    cardDetails = {
        cardNo: '5641',
        expDate: '01/03/2014',
        bank: 'VISA CARD BRAC BANK',
        cardHolder: ''
    }
}) => {
    const invoiceRef = useRef();

    // Format currency
    const formatCurrency = (amount) => {
        return Number(amount).toFixed(2);
    };

    // Convert number to words (simplified version)
    const numberToWords = (num) => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        
        if (num === 0) return 'Zero';
        
        const convertLessThanThousand = (n) => {
            if (n === 0) return '';
            if (n < 10) return ones[n];
            if (n < 20) return teens[n - 10];
            if (n < 100) {
                return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
            }
            return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
        };
        
        const integer = Math.floor(num);
        const decimal = Math.round((num - integer) * 100);
        
        let result = '';
        if (integer >= 1000) {
            result += convertLessThanThousand(Math.floor(integer / 1000)) + ' Thousand ';
            integer %= 1000;
        }
        result += convertLessThanThousand(integer);
        
        if (decimal > 0) {
            result += ' point ' + convertLessThanThousand(decimal);
        }
        
        return result.trim() + ' Only';
    };

    // Print function
    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Cash Receipt - ${invoiceNo}</title>
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
                        background: #f3f4f6;
                        display: flex;
                        justify-content: center;
                    }
                    .receipt {
                        max-width: 700px;
                        background: white;
                        padding: 25px;
                        border: 1px solid #e5e7eb;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    }
                    .header {
                        text-align: center;
                        border-bottom: 2px dashed #000;
                        padding-bottom: 15px;
                        margin-bottom: 15px;
                    }
                    .header h1 {
                        font-size: 28px;
                        font-weight: bold;
                        text-transform: uppercase;
                        margin-bottom: 5px;
                    }
                    .header h2 {
                        font-size: 24px;
                        font-weight: bold;
                        margin: 10px 0;
                    }
                    .receipt-no {
                        font-size: 18px;
                        font-weight: bold;
                        margin: 5px 0;
                    }
                    .info-row {
                        display: flex;
                        margin-bottom: 8px;
                        font-size: 14px;
                    }
                    .info-label {
                        width: 150px;
                        font-weight: 600;
                    }
                    .info-value {
                        flex: 1;
                    }
                    .section-title {
                        font-weight: bold;
                        font-size: 16px;
                        margin: 15px 0 10px 0;
                        border-bottom: 1px solid #000;
                        padding-bottom: 5px;
                    }
                    .items-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 15px 0;
                        font-size: 14px;
                    }
                    .items-table th {
                        text-align: left;
                        padding: 8px;
                        border-bottom: 1px solid #000;
                    }
                    .items-table td {
                        padding: 8px;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    .text-right {
                        text-align: right;
                    }
                    .text-center {
                        text-align: center;
                    }
                    .amount-box {
                        border: 1px solid #000;
                        padding: 15px;
                        margin: 15px 0;
                        text-align: center;
                        font-weight: bold;
                    }
                    .payment-details {
                        margin: 15px 0;
                        font-size: 14px;
                    }
                    .footer {
                        margin-top: 20px;
                        padding-top: 15px;
                        border-top: 2px dashed #000;
                        font-size: 12px;
                    }
                    .note {
                        font-size: 14px;
                        font-weight: bold;
                        margin: 10px 0;
                    }
                    .vitals {
                        font-size: 13px;
                        margin: 10px 0;
                        padding: 10px 0;
                        border-top: 1px solid #e5e7eb;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    @media print {
                        body { background: white; padding: 0; }
                        .receipt { box-shadow: none; border: none; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div class="header">
                        <h1>CASH RECEIPT</h1>
                        <div class="receipt-no">Bill Type: ${billType === 'doctor' ? 'Normal' : billType.charAt(0).toUpperCase() + billType.slice(1)}</div>
                        <div class="receipt-no">Cash Receipt No: ${invoiceNo}</div>
                    </div>

                    <div class="info-row">
                        <span class="info-label">UHID:</span>
                        <span class="info-value">${patientInfo.patientId || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Patient Name:</span>
                        <span class="info-value">${patientInfo.patientName?.toUpperCase() || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Referred By/Doctor:</span>
                        <span class="info-value">${patientInfo.doctorName || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Department:</span>
                        <span class="info-value">${patientInfo.department || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">App Date & Time:</span>
                        <span class="info-value">
                            ${appointmentInfo?.appointment_date || new Date().toLocaleDateString()} 
                            ${appointmentInfo?.appointment_time || ''}
                        </span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Bill No:</span>
                        <span class="info-value">${invoiceNo}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Gender/Age:</span>
                        <span class="info-value">${patientInfo.gender || 'N/A'}/${patientInfo.age || 'N/A'}</span>
                    </div>

                    <div class="section-title">SL# Service Particulars</div>
                    
                    <div style="font-weight: bold; margin: 10px 0;">CONSULTATION FEES</div>
                    
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th class="text-right">Units</th>
                                <th class="text-right">Amount TK</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${billType === 'doctor' ? doctorItems.map((item, index) => `
                                <tr>
                                    <td>${index + 1}. ${item.service || 'CONSULTATION FEES-GASTRO INTERNAL MEDICINE'}<br>
                                        <span style="font-size: 12px;">${patientInfo.doctorName || 'DR. MUHAMMAD LUTFUL LATIF CHAWDHURY'}</span>
                                    </td>
                                    <td class="text-right">1</td>
                                    <td class="text-right">${formatCurrency(item.amount)}</td>
                                </tr>
                            `).join('') : ''}
                            
                            ${billType === 'lab' ? labItems.map((item, index) => `
                                <tr>
                                    <td>${index + 1}. ${item.testName || 'LAB TEST'}</td>
                                    <td class="text-right">${item.quantity}</td>
                                    <td class="text-right">${formatCurrency(item.amount)}</td>
                                </tr>
                            `).join('') : ''}
                            
                            ${billType === 'medicine' ? medicineItems.map((item, index) => `
                                <tr>
                                    <td>${index + 1}. ${item.medicineName || 'MEDICINE'}</td>
                                    <td class="text-right">${item.quantity}</td>
                                    <td class="text-right">${formatCurrency(item.amount)}</td>
                                </tr>
                            `).join('') : ''}
                        </tbody>
                    </table>

                    <div style="margin-top: 20px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="width: 60%;"></td>
                                <td style="width: 40%;">
                                    <table style="width: 100%;">
                                        <tr>
                                            <td>Total</td>
                                            <td class="text-right">${formatCurrency(subtotal)}</td>
                                        </tr>
                                        <tr>
                                            <td>VAT Amount(+)</td>
                                            <td class="text-right">${formatCurrency(tax)}</td>
                                        </tr>
                                        <tr>
                                            <td style="font-weight: bold;">Billed Amount</td>
                                            <td class="text-right" style="font-weight: bold;">${formatCurrency(grandTotal)}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div class="amount-box">
                        Net Amt Received: ${formatCurrency(grandTotal)}
                    </div>

                    <div class="payment-details">
                        [By ${paymentMode} : ${formatCurrency(grandTotal)}, Card No : ${cardDetails.cardNo}, 
                        Exp. Date : ${cardDetails.expDate}, Bank : ${cardDetails.bank}, 
                        Card Holder : ${cardDetails.cardHolder}]
                    </div>

                    <div style="font-weight: bold; margin: 15px 0;">
                        (TK) ${numberToWords(grandTotal)}
                    </div>

                    <div class="note">
                        [Please Note Our New Appointment Center Telephone No: 8845242]
                    </div>

                    <div class="vitals">
                        T...9&F...8.8.10.8...18-C<br>
                        HT...02.49 WT...6.3.109 BP...120180 amm kg<br>
                        ALLERGIES:<br>
                        SP2-98%
                    </div>

                    <div class="footer">
                        Printed By: ${hospitalInfo?.user_id || '12900'}<br>
                        Prepared By: ${hospitalInfo?.prepared_by || 'MOHAMMED ARIF HOSSAIN'}<br>
                        Printed at: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
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
            const printContent = document.createElement('div');
            printContent.innerHTML = `
                <div style="font-family: 'Inter', sans-serif; max-width: 700px; margin: 0 auto; padding: 25px; background: white;">
                    <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 15px; margin-bottom: 15px;">
                        <h1 style="font-size: 28px; font-weight: bold; text-transform: uppercase; margin-bottom: 5px;">CASH RECEIPT</h1>
                        <div style="font-size: 18px; font-weight: bold; margin: 5px 0;">Bill Type: ${billType === 'doctor' ? 'Normal' : billType}</div>
                        <div style="font-size: 18px; font-weight: bold; margin: 5px 0;">Cash Receipt No: ${invoiceNo}</div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        ${[
                            ['UHID:', patientInfo.patientId || 'N/A'],
                            ['Patient Name:', patientInfo.patientName?.toUpperCase() || 'N/A'],
                            ['Referred By/Doctor:', patientInfo.doctorName || 'N/A'],
                            ['Department:', patientInfo.department || 'N/A'],
                            ['App Date & Time:', `${appointmentInfo?.appointment_date || new Date().toLocaleDateString()} ${appointmentInfo?.appointment_time || ''}`],
                            ['Bill No:', invoiceNo],
                            ['Gender/Age:', `${patientInfo.gender || 'N/A'}/${patientInfo.age || 'N/A'}`]
                        ].map(([label, value]) => `
                            <div style="display: flex; margin-bottom: 8px; font-size: 14px;">
                                <span style="width: 150px; font-weight: 600;">${label}</span>
                                <span style="flex: 1;">${value}</span>
                            </div>
                        `).join('')}
                    </div>

                    <div style="font-weight: bold; font-size: 16px; margin: 15px 0 10px 0; border-bottom: 1px solid #000; padding-bottom: 5px;">
                        SL# Service Particulars
                    </div>
                    
                    <div style="font-weight: bold; margin: 10px 0;">CONSULTATION FEES</div>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
                        <thead>
                            <tr>
                                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #000;"></th>
                                <th style="text-align: right; padding: 8px; border-bottom: 1px solid #000;">Units</th>
                                <th style="text-align: right; padding: 8px; border-bottom: 1px solid #000;">Amount TK</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${billType === 'doctor' ? doctorItems.map((item, index) => `
                                <tr>
                                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                                        ${index + 1}. ${item.service || 'CONSULTATION FEES-GASTRO INTERNAL MEDICINE'}<br>
                                        <span style="font-size: 12px;">${patientInfo.doctorName || 'DR. MUHAMMAD LUTFUL LATIF CHAWDHURY'}</span>
                                    </td>
                                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">1</td>
                                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.amount)}</td>
                                </tr>
                            `).join('') : ''}
                        </tbody>
                    </table>

                    <div style="margin-top: 20px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="width: 60%;"></td>
                                <td style="width: 40%;">
                                    <table style="width: 100%;">
                                        <tr>
                                            <td style="padding: 4px;">Total</td>
                                            <td style="padding: 4px; text-align: right;">${formatCurrency(subtotal)}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 4px;">VAT Amount(+)</td>
                                            <td style="padding: 4px; text-align: right;">${formatCurrency(tax)}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 4px; font-weight: bold;">Billed Amount</td>
                                            <td style="padding: 4px; text-align: right; font-weight: bold;">${formatCurrency(grandTotal)}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div style="border: 1px solid #000; padding: 15px; margin: 15px 0; text-align: center; font-weight: bold;">
                        Net Amt Received: ${formatCurrency(grandTotal)}
                    </div>

                    <div style="margin: 15px 0; font-size: 14px;">
                        [By ${paymentMode} : ${formatCurrency(grandTotal)}, Card No : ${cardDetails.cardNo}, 
                        Exp. Date : ${cardDetails.expDate}, Bank : ${cardDetails.bank}, 
                        Card Holder : ${cardDetails.cardHolder}]
                    </div>

                    <div style="font-weight: bold; margin: 15px 0;">
                        (TK) ${numberToWords(grandTotal)}
                    </div>

                    <div style="font-size: 14px; font-weight: bold; margin: 10px 0;">
                        [Please Note Our New Appointment Center Telephone No: 8845242]
                    </div>

                    <div style="font-size: 13px; margin: 10px 0; padding: 10px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
                        T...9&F...8.8.10.8...18-C<br>
                        HT...02.49 WT...6.3.109 BP...120180 amm kg<br>
                        ALLERGIES:<br>
                        SP2-98%
                    </div>

                    <div style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #000; font-size: 12px;">
                        Printed By: ${hospitalInfo?.user_id || '12900'}<br>
                        Prepared By: ${hospitalInfo?.prepared_by || 'MOHAMMED ARIF HOSSAIN'}<br>
                        Printed at: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
                    </div>
                </div>
            `;

            document.body.appendChild(printContent);

            const canvas = await html2canvas(printContent, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true
            });

            document.body.removeChild(printContent);

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 190;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgWidth, imgHeight);
            pdf.save(`receipt-${invoiceNo}.pdf`);

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
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
                            Print Receipt
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                        >
                            <Download size={16} />
                            Download PDF
                        </button>
                    </>
                )}
            </div>

            {/* Receipt Preview */}
            <div ref={invoiceRef} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 font-mono">
                <div className="text-center border-b-2 border-black pb-4 mb-4">
                    <h1 className="text-2xl font-bold uppercase">CASH RECEIPT</h1>
                    <p className="font-bold">Bill Type: {billType === 'doctor' ? 'Normal' : billType}</p>
                    <p className="font-bold">Cash Receipt No: {invoiceNo}</p>
                </div>

                <div className="space-y-2 text-sm">
                    <div className="flex">
                        <span className="w-32 font-bold">UHID:</span>
                        <span>{patientInfo.patientId || 'N/A'}</span>
                    </div>
                    <div className="flex">
                        <span className="w-32 font-bold">Patient Name:</span>
                        <span className="font-bold">{patientInfo.patientName?.toUpperCase() || 'N/A'}</span>
                    </div>
                    <div className="flex">
                        <span className="w-32">Referred By/Doctor:</span>
                        <span>{patientInfo.doctorName || 'N/A'}</span>
                    </div>
                    <div className="flex">
                        <span className="w-32">Department:</span>
                        <span>{patientInfo.department || 'N/A'}</span>
                    </div>
                    <div className="flex">
                        <span className="w-32">App Date & Time:</span>
                        <span>
                            {appointmentInfo?.appointment_date || new Date().toLocaleDateString()} 
                            {appointmentInfo?.appointment_time || ''}
                        </span>
                    </div>
                    <div className="flex">
                        <span className="w-32">Bill No:</span>
                        <span>{invoiceNo}</span>
                    </div>
                    <div className="flex">
                        <span className="w-32">Gender/Age:</span>
                        <span>{patientInfo.gender || 'N/A'}/{patientInfo.age || 'N/A'}</span>
                    </div>
                </div>

                <div className="font-bold text-lg mt-4 mb-2 border-b border-black pb-1">
                    SL# Service Particulars
                </div>
                
                <div className="font-bold mt-3">CONSULTATION FEES</div>
                
                <table className="w-full text-sm mt-2">
                    <thead>
                        <tr className="border-b border-black">
                            <th className="text-left py-2"></th>
                            <th className="text-right py-2">Units</th>
                            <th className="text-right py-2">Amount TK</th>
                        </tr>
                    </thead>
                    <tbody>
                        {billType === 'doctor' && doctorItems.map((item, index) => (
                            <tr key={item.id} className="border-b border-gray-200">
                                <td className="py-2">
                                    {index + 1}. {item.service || 'CONSULTATION FEES-GASTRO INTERNAL MEDICINE'}<br />
                                    <span className="text-xs">{patientInfo.doctorName || 'DR. MUHAMMAD LUTFUL LATIF CHAWDHURY'}</span>
                                </td>
                                <td className="py-2 text-right">1</td>
                                <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mt-4">
                    <table className="w-full">
                        <tr>
                            <td className="w-2/3"></td>
                            <td className="w-1/3">
                                <table className="w-full">
                                    <tr>
                                        <td>Total</td>
                                        <td className="text-right">{formatCurrency(subtotal)}</td>
                                    </tr>
                                    <tr>
                                        <td>VAT Amount(+)</td>
                                        <td className="text-right">{formatCurrency(tax)}</td>
                                    </tr>
                                    <tr className="font-bold">
                                        <td>Billed Amount</td>
                                        <td className="text-right">{formatCurrency(grandTotal)}</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </div>

                <div className="border border-black p-3 my-4 text-center font-bold">
                    Net Amt Received: {formatCurrency(grandTotal)}
                </div>

                <div className="text-sm my-3">
                    [By {paymentMode} : {formatCurrency(grandTotal)}, Card No : {cardDetails.cardNo}, 
                    Exp. Date : {cardDetails.expDate}, Bank : {cardDetails.bank}, 
                    Card Holder : {cardDetails.cardHolder}]
                </div>

                <div className="font-bold my-3">
                    (TK) {numberToWords(grandTotal)}
                </div>

                <div className="font-bold text-sm my-3">
                    [Please Note Our New Appointment Center Telephone No: 8845242]
                </div>

                <div className="text-xs my-3 py-2 border-y border-gray-300">
                    T...9&F...8.8.10.8...18-C<br />
                    HT...02.49 WT...6.3.109 BP...120180 amm kg<br />
                    ALLERGIES:<br />
                    SP2-98%
                </div>

                <div className="text-xs mt-4 pt-3 border-t-2 border-black">
                    Printed By: {hospitalInfo?.user_id || '12900'}<br />
                    Prepared By: {hospitalInfo?.prepared_by || 'MOHAMMED ARIF HOSSAIN'}<br />
                    Printed at: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                </div>
            </div>
        </div>
    );
};

export default InvoiceLayout;