const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
]

// แปลงรูปแบบเวลาตามเงื่อนไข:
// - ไม่เกิน 1 วัน: แสดงเวลาสัมพัทธ์ (นาทีที่แล้ว, ชั่วโมงที่แล้ว)
// - เกิน 1 วัน: แสดง วันที่ และ ตัวย่อเดือน (และเวลาเมื่อเปิดป็อปอัป เช่น 5 มิ.ย. เวลา 18:30 น.)
// - เกินปี: แสดง วันที่, ตัวย่อเดือน และ ปี (และเวลาเมื่อเปิดป็อปอัป เช่น 30 มิ.ย. 68 เวลา 10:00 น.)
export function formatNotificationTime(input, includeTime = false) {
    if (!input) return ''
    const date = new Date(input)
    if (isNaN(date.getTime())) {
        return String(input)
    }

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()

    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const timeStr = `เวลา ${hours}:${minutes} น.`

    // กรณีเวลาล่วงหน้า
    if (diffMs < 0) {
        const day = date.getDate()
        const month = thaiMonths[date.getMonth()]
        const yearNow = now.getFullYear()
        const dateYear = date.getFullYear()
        const yearStr = yearNow !== dateYear ? ` ${String(dateYear + 543).slice(-2)}` : ''
        return includeTime ? `${day} ${month}${yearStr} ${timeStr}` : `${day} ${month}${yearStr}`
    }

    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    // 1. ถ้าไม่เกิน 1 วัน (diffHours < 24)
    if (diffHours < 24) {
        if (includeTime) {
            if (diffMinutes < 1) return `เมื่อสักครู่ (${hours}:${minutes} น.)`
            if (diffMinutes < 60) return `${diffMinutes} นาทีที่แล้ว (${hours}:${minutes} น.)`
            return `${diffHours} ชั่วโมงที่แล้ว (${hours}:${minutes} น.)`
        }
        if (diffMinutes < 1) return 'เมื่อสักครู่'
        if (diffMinutes < 60) return `${diffMinutes} นาทีที่แล้ว`
        return `${diffHours} ชั่วโมงที่แล้ว`
    }

    const day = date.getDate()
    const month = thaiMonths[date.getMonth()]
    const yearNow = now.getFullYear()
    const dateYear = date.getFullYear()

    // 2. ถ้าเกินปี (คนละปี หรือ diffDays >= 365)
    if (yearNow !== dateYear || diffDays >= 365) {
        const thaiYearShort = String(dateYear + 543).slice(-2)
        return includeTime
            ? `${day} ${month} ${thaiYearShort} ${timeStr}`
            : `${day} ${month} ${thaiYearShort}`
    }

    // 3. ถ้าเกิน 1 วัน (แต่อยู่ในปีเดียวกัน)
    return includeTime
        ? `${day} ${month} ${timeStr}`
        : `${day} ${month}`
}

// จุดสีของแจ้งเตือน: ยังไม่อ่านเป็นสีแดงทุกรายการ อ่านแล้วเป็นสีเทา
export const unreadDotClass = 'bg-[#ef4444]'
export const readDotClass = 'bg-[#6b7280]'

// ป้ายประเภทแจ้งเตือน
export const typeLabels = {
    repair: 'แจ้งซ่อม',
    invoice: 'ใบแจ้งหนี้',
    system: 'ระบบ',
}
