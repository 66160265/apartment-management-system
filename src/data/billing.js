// ค่าเริ่มต้นของการตั้งค่าหอพัก ใช้เมื่อยังไม่ได้ตั้งค่าในหน้า "ตั้งค่า" (ตาราง app_settings)
// ค่าจริงแก้ได้ในหน้าตั้งค่าโดยไม่ต้องแก้โค้ด
export const DEFAULT_SETTINGS = {
    apartmentName: 'หอพักสุขสันต์',
    apartmentNameEn: 'Suksan Apartment',
    address: '99/1 ซอยรื่นรมย์ ถ.ประชาอุทิศ แขวงบางมด เขตทุ่งครุ กรุงเทพฯ 10140',
    phone: '062-895-4321',
    email: 'contact@suksan-apartment.com',
    bankName: 'ธนาคารกสิกรไทย',
    bankAccount: '098-2-87654-3',
    bankHolder: 'หอพักสุขสันต์',
    // เบอร์พร้อมเพย์ (10 หลัก) หรือเลขบัตรประชาชน/เลขผู้เสียภาษี (13 หลัก)
    promptpayId: '062-895-4321',
    // วันครบกำหนดชำระของเดือนถัดไป
    dueDay: 5,
    // อัตราเริ่มต้นตอนสร้างใบแจ้งหนี้ใหม่ (บาท/หน่วย)
    rateWater: 18,
    rateElectric: 7,
    commonFee: 0,
}

export const invoiceStatuses = {
    pending: { label: 'รอชำระ', color: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    review: { label: 'รอตรวจสอบ', color: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500' },
    paid: { label: 'ชำระแล้ว', color: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
}
