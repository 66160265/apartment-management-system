// สถานะการแจ้งซ่อม (ค่าที่เก็บในฐานข้อมูล -> ป้ายและสี)
// pending รอดำเนินการ -> in_progress กำลังดำเนินการ (มีวันนัดเข้าซ่อม) -> done เสร็จสิ้น, cancelled ยกเลิก/ไม่รับเรื่อง
// (scheduled นัดหมายแล้ว = สถานะเดิมที่เลิกใช้ เก็บป้ายไว้แสดงข้อมูลเก่าเท่านั้น)
export const repairStatuses = {
    pending: { label: 'รอดำเนินการ', color: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500' },
    scheduled: { label: 'นัดหมายแล้ว', color: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200', dot: 'bg-violet-500' },
    in_progress: { label: 'กำลังดำเนินการ', short: 'กำลังซ่อม', color: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    done: { label: 'เสร็จสิ้น', color: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
    cancelled: { label: 'ยกเลิก', color: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200', dot: 'bg-slate-400' },
}

// รายชื่อสถานะทั้งหมดตามลำดับ (ใช้ทำแท็บและตัวเลือกสถานะ)
export const repairStatusKeys = ['pending', 'in_progress', 'done', 'cancelled']

// ขั้นตอนบนแถบความคืบหน้า (ไม่รวม "ยกเลิก" ซึ่งเป็นทางแยก)
export const repairProgressKeys = ['pending', 'in_progress', 'done']

// ประเภทงานซ่อม เรียงจากเรื่องที่แจ้งบ่อยก่อน ("อื่น ๆ" อยู่ท้ายสุด) ค่าที่ใช้ได้ต้องตรงกับ repairs_category_check ในฐานข้อมูล
export const repairCategories = {
    aircon: 'แอร์',
    plumbing: 'ประปา / ก๊อก / ท่อ / ชักโครก',
    electric: 'ไฟฟ้า / หลอดไฟ / ปลั๊ก',
    internet: 'อินเทอร์เน็ต / Wi-Fi',
    appliance: 'เครื่องใช้ไฟฟ้า (ตู้เย็น ทีวี เครื่องทำน้ำอุ่น)',
    door: 'ประตู / หน้าต่าง / กุญแจ',
    furniture: 'เฟอร์นิเจอร์',
    structure: 'ผนัง / เพดาน / พื้น',
    other: 'อื่น ๆ',
}

// ความเร่งด่วน (ฉุกเฉิน = ช่างเข้าได้ทันทีโดยไม่ต้องรอนัด)
export const repairUrgencies = {
    normal: { label: 'ปกติ', hint: 'รอนัดวันที่สะดวกได้', color: 'bg-slate-100 text-slate-700' },
    urgent: { label: 'ด่วน', hint: 'ใช้งานไม่ได้ ควรซ่อมภายใน 1-2 วัน', color: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
    emergency: { label: 'ฉุกเฉิน', hint: 'อันตรายหรือเสียหายต่อเนื่อง เช่น น้ำรั่วหนัก ไฟช็อต', color: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

// เวลาเข้าซ่อม: ผู้เช่ากำหนดช่วงเอง (เวลาเริ่ม - เวลาสิ้นสุด ทีละ 1 ชั่วโมง) ภายใน 09:00-18:00 เก็บเป็น "HH:MM-HH:MM" เช่น "09:00-16:00"
// (start/end = ขอบเขตของช่วงที่เลือกได้, step = ระยะห่างของเวลาที่เลือกได้เป็นนาที)
export const REPAIR_HOURS = { start: '09:00', end: '18:00', step: 60 }

// เวลาพักของช่าง: ช่วงที่เลือกเริ่มในเวลานี้ไม่ได้ (คร่อมเวลาพักได้ เช่น 09:00-16:00) ฐานข้อมูลกันซ้ำด้วยค่าเดียวกัน
export const REPAIR_BREAK = { start: '12:00', end: '13:00' }

// ค่าแบบเดิม (ก่อนให้ระบุเวลาเอง) ที่ยังอยู่ในรายการเก่า
export const legacyPeriods = {
    morning: '09:00-12:00',
    afternoon: '13:00-17:00',
    evening: '17:00-20:00',
}

// ค่าซ่อมที่ผู้เช่าจ่าย: ต้องชำระภายในกี่วันหลังซ่อมเสร็จ และค่าปรับต่อวันที่แจ้งผู้เช่า
// (แสดงข้อความเท่านั้น ระบบไม่ได้บวกค่าปรับเข้ายอดชำระ ผู้ดูแลเรียกเก็บเอง)
export const REPAIR_PAY_DAYS = 1
export const REPAIR_LATE_FEE_PER_DAY = 50

// จำนวนวันเวลาที่ผู้เช่าเลือกได้ (ตรงกับ repairs_slots_check ในฐานข้อมูล)
export const MAX_SLOTS = 3
