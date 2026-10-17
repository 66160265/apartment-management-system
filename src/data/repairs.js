// สถานะการแจ้งซ่อม (ค่าที่เก็บในฐานข้อมูล -> ป้ายและสี)
// pending รอนัดหมาย -> scheduled นัดหมายแล้ว -> in_progress กำลังซ่อม -> done เสร็จสิ้น, cancelled ยกเลิก/ไม่รับเรื่อง
export const repairStatuses = {
    pending: { label: 'รอนัดหมาย', color: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500' },
    scheduled: { label: 'นัดหมายแล้ว', color: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200', dot: 'bg-violet-500' },
    in_progress: { label: 'กำลังซ่อม', color: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    done: { label: 'เสร็จสิ้น', color: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
    cancelled: { label: 'ยกเลิก', color: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200', dot: 'bg-slate-400' },
}

// รายชื่อสถานะทั้งหมดตามลำดับ (ใช้ทำแท็บและตัวเลือกสถานะ)
export const repairStatusKeys = Object.keys(repairStatuses)

// ขั้นตอนบนแถบความคืบหน้า (ไม่รวม "ยกเลิก" ซึ่งเป็นทางแยก)
export const repairProgressKeys = ['pending', 'scheduled', 'in_progress', 'done']

// ประเภทงานซ่อม
export const repairCategories = {
    electric: 'ไฟฟ้า / หลอดไฟ / ปลั๊ก',
    plumbing: 'ประปา / ก๊อก / ท่อ / ชักโครก',
    aircon: 'แอร์',
    appliance: 'เครื่องใช้ไฟฟ้า (ตู้เย็น ทีวี เครื่องทำน้ำอุ่น)',
    furniture: 'เฟอร์นิเจอร์',
    door: 'ประตู / หน้าต่าง / กุญแจ',
    other: 'อื่น ๆ',
}

// ความเร่งด่วน (ฉุกเฉิน = ช่างเข้าได้ทันทีโดยไม่ต้องรอนัด)
export const repairUrgencies = {
    normal: { label: 'ปกติ', hint: 'รอนัดวันที่สะดวกได้', color: 'bg-slate-100 text-slate-700' },
    urgent: { label: 'ด่วน', hint: 'ใช้งานไม่ได้ ควรซ่อมภายใน 1-2 วัน', color: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
    emergency: { label: 'ฉุกเฉิน', hint: 'อันตรายหรือเสียหายต่อเนื่อง เช่น น้ำรั่วหนัก ไฟช็อต', color: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

// ช่วงเวลาเข้าซ่อม: ระบุเวลาเองระหว่าง 09:00-20:00 ทีละ 30 นาที เก็บเป็น "HH:MM-HH:MM" (ตรงกับ constraint ในฐานข้อมูล)
export const REPAIR_HOURS = { start: '09:00', end: '20:00', step: 30 }
export const DEFAULT_PERIOD = '09:00-12:00'

// ค่าแบบเดิม (ก่อนให้ระบุเวลาเอง) ที่ยังอยู่ในรายการเก่า
export const legacyPeriods = {
    morning: '09:00-12:00',
    afternoon: '13:00-17:00',
    evening: '17:00-20:00',
}

// จำนวนช่วงเวลาที่ผู้เช่าเลือกได้สูงสุด (ตรงกับ constraint ในฐานข้อมูล)
export const MAX_SLOTS = 3
