// อัตราค่าบริการเริ่มต้น (บาท/หน่วย) ใช้ตอนสร้างใบแจ้งหนี้ใหม่ ค่าที่บันทึกไว้ในใบแจ้งหนี้เดิมไม่เปลี่ยนตาม
export const RATES = { water: 32, electric: 7, common: 0 }

// บัญชีรับโอนที่แสดงให้ผู้เช่า ปรับเป็นข้อมูลจริงของหอพัก
export const BANK = {
    name: 'ธนาคารกสิกรไทย',
    account: '098-2-87654-3',
    holder: 'หอพักสุขสันต์',
    promptpay: '062-895-4321',
}

export const invoiceStatuses = {
    pending: { label: 'รอชำระ', color: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    review: { label: 'รอตรวจสอบ', color: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500' },
    paid: { label: 'ชำระแล้ว', color: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
}
