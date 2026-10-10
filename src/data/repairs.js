// สถานะการแจ้งซ่อม (ค่าที่เก็บในฐานข้อมูล -> ป้ายและสี)
export const repairStatuses = {
    pending: { label: 'รอดำเนินการ', color: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500' },
    in_progress: { label: 'กำลังดำเนินการ', color: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    done: { label: 'เสร็จสิ้น', color: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
}

export const repairStatusKeys = Object.keys(repairStatuses)
