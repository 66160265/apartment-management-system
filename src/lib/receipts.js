import { formatMonth, invoiceCode, thaiDateOf } from './billing'

// ใบเสร็จรับเงิน (PDF) ออกให้ทุกครั้งที่ยืนยันรับเงิน: ตรรกะประกอบข้อมูล แยกจากหน้าตาเอกสาร (components/ReceiptDocument.jsx) เพื่อทดสอบได้
// เลขที่ใบเสร็จออกโดยฐานข้อมูลตอนยืนยันรับเงิน (receipt_no ดู supabase/migrations/20261022000000_initial_schema.sql (ส่วน payments)) ที่นี่แค่จัดรูปแบบ

// RC-<ปี ค.ศ. ของวันที่รับเงิน (เวลาไทย)>-<เลข 6 หลัก> เช่น RC-2026-000012 ไม่มีเลข (ข้อมูลก่อนมีระบบ/ยังไม่ได้รัน SQL) = ว่าง
export function receiptCode(receiptNo, atIso) {
    if (receiptNo === null || receiptNo === undefined || !atIso) return ''
    return `RC-${thaiDateOf(new Date(atIso)).slice(0, 4)}-${String(receiptNo).padStart(6, '0')}`
}

const round2 = (n) => Math.round(Number(n) * 100) / 100

// เรียงการรับเงินตามเวลารับ (เท่ากันเรียงตามเลขที่ใบเสร็จ)
const byTime = (a, b) => String(a.confirmed_at).localeCompare(String(b.confirmed_at)) || Number(a.receipt_no ?? 0) - Number(b.receipt_no ?? 0)

// ใบเสร็จของการรับเงินค่าห้อง 1 ครั้ง
// payment = แถว invoice_payments ที่ออกใบเสร็จ, invoice = ใบแจ้งหนี้, payments = การรับเงินทั้งหมดของใบนี้ (หาว่าเป็นครั้งที่เท่าไหร่ และรับสะสมเท่าไหร่)
export function buildInvoiceReceipt({ payment, invoice, payments }) {
    const ordered = [...payments].sort(byTime)
    const index = Math.max(0, ordered.findIndex((p) => p.id === payment.id))
    const cumulative = round2(ordered.slice(0, index + 1).reduce((acc, p) => acc + Number(p.amount), 0))
    // ครั้งสุดท้ายของใบที่ชำระครบแล้ว = ปิดยอด (ใบเสร็จก่อนหน้าเป็นการรับบางส่วน)
    const isFinal = invoice.status === 'paid' && index === ordered.length - 1
    const lateFee = isFinal ? round2(invoice.late_fee ?? 0) : 0
    return {
        kind: 'invoice',
        code: receiptCode(payment.receipt_no, payment.confirmed_at),
        date: payment.confirmed_at,
        room: invoice.room,
        tenantName: invoice.tenant_name,
        description: `ค่าเช่าและค่าบริการ เดือน ${formatMonth(invoice.month)}`,
        reference: invoiceCode(invoice),
        amount: round2(payment.amount),
        // รับสะสมถึงใบเสร็จนี้ และยอดบิล (ใบเสร็จที่ปิดยอดมีค่าปรับที่คิดจริงรวมด้วย)
        cumulative,
        billTotal: round2(invoice.total),
        lateFee,
        dueTotal: round2(Number(invoice.total) + lateFee),
        installment: ordered.length > 1 ? { number: index + 1, of: ordered.length } : null,
        status: isFinal ? 'paid' : 'partial',
        // ยอดที่โอนเกินและหอพักต้องโอนคืน (แสดงในใบเสร็จที่ปิดยอด)
        overpaid: isFinal ? round2(invoice.refund_amount ?? 0) : 0,
        refunded: isFinal && invoice.refund_status === 'done',
        transRef: payment.trans_ref ?? '',
        autoApproved: Boolean(payment.auto_approved),
        // transfer = โอน (ผ่านสลิป) deposit = หักจากเงินประกันตอนย้ายออก
        source: payment.source ?? 'transfer',
    }
}

// ใบเสร็จค่าซ่อม (จ่ายครั้งเดียวเต็มยอด) payment = แถว repair_payments ที่ชำระแล้ว, repair = เรื่องแจ้งซ่อม
export function buildRepairReceipt({ payment, repair }) {
    return {
        kind: 'repair',
        code: receiptCode(payment.receipt_no, payment.reviewed_at),
        date: payment.reviewed_at,
        room: repair.room,
        tenantName: repair.tenant_name,
        description: `ค่าซ่อม: ${repair.problem}`,
        reference: '',
        amount: round2(payment.amount),
        cumulative: round2(payment.amount),
        billTotal: round2(payment.amount),
        lateFee: 0,
        dueTotal: round2(payment.amount),
        installment: null,
        status: 'paid',
        overpaid: 0,
        refunded: false,
        transRef: payment.trans_ref ?? '',
        autoApproved: Boolean(payment.auto_approved),
        source: 'transfer',
    }
}

// ชื่อไฟล์ PDF เช่น RC-2026-000012.pdf (ไม่มีเลขที่ใช้ชื่อสำรองจากห้องและวันที่)
export function receiptFileName(receipt) {
    return `${receipt.code || `RECEIPT-${receipt.room}-${thaiDateOf(new Date(receipt.date))}`}.pdf`
}
