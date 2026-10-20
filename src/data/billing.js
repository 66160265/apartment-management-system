// ค่าเริ่มต้นของการตั้งค่าหอพัก ใช้เมื่อยังไม่ได้ตั้งค่าในหน้า "ตั้งค่า" (ตาราง app_settings)
// ค่าจริงแก้ได้ในหน้าตั้งค่าโดยไม่ต้องแก้โค้ด
export const DEFAULT_SETTINGS = {
    apartmentName: 'หอพักสุขสันต์',
    apartmentNameEn: 'Suksan Apartment',
    // ข้อมูลติดต่อและบัญชีรับชำระเว้นว่างไว้ตั้งใจ ห้ามใส่ข้อมูลตัวอย่าง ไม่งั้นผู้เช่าอาจโอนเงินไปบัญชีที่ไม่ใช่ของหอพัก
    // ว่าง = ยังไม่ได้ตั้งค่า หน้าชำระเงินจะบอกผู้เช่าให้ติดต่อผู้ดูแล และไม่แสดง QR
    address: '',
    phone: '',
    email: '',
    bankName: '',
    bankAccount: '',
    bankHolder: '',
    // เบอร์พร้อมเพย์ (10 หลัก) หรือเลขบัตรประชาชน/เลขผู้เสียภาษี (13 หลัก)
    promptpayId: '',
    // วันครบกำหนดชำระของเดือนถัดไป
    dueDay: 5,
    // อัตราเริ่มต้นตอนสร้างใบแจ้งหนี้ใหม่ (บาท/หน่วย)
    rateWater: 18,
    rateElectric: 7,
    commonFee: 0,
}

// สถานะใบแจ้งหนี้ (ค่าที่เก็บในฐานข้อมูล -> ป้ายและสีที่แสดง)
export const invoiceStatuses = {
    pending: { label: 'รอชำระ', color: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    review: { label: 'รอตรวจสอบ', color: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500' },
    paid: { label: 'ชำระแล้ว', color: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
}
