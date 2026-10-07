export const thaiMonths = [
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

export const initialNotifications = [
    {
        id: 1,
        title: 'สัญญาใกล้หมดอายุ',
        subtitle: 'ห้อง 204 — สิ้นสุด 30 มิ.ย. 68',
        room: '204',
        date: '30 มิ.ย. 68',
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 นาทีที่แล้ว
        type: 'contract',
        typeLabel: 'สัญญาเช่า',
        dotColor: 'red',
        details: 'สัญญาเช่าห้อง 204 กำลังจะสิ้นสุดในวันที่ 30 มิถุนายน 2568 (เหลือเวลาอีกไม่ถึง 15 วัน) กรุณาติดต่อผู้เช่าเพื่อสอบถามการต่อสัญญาใหม่หรือทำเรื่องแจ้งย้ายออกและวางแผนตรวจรับห้องพัก',
        tenantName: 'สมชาย มั่นคง',
        phone: '081-234-5678',
        actionLink: '/tenants',
        actionLabel: 'ดูข้อมูลผู้เช่าห้อง 204',
    },
    {
        id: 2,
        title: 'รอตรวจสอบสลิป',
        subtitle: 'ห้อง 108, 312 — รอยืนยัน',
        room: '108, 312',
        date: 'วันนี้ 13:45 น.',
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 ชั่วโมงที่แล้ว
        type: 'payment',
        typeLabel: 'การเงิน & ใบแจ้งหนี้',
        dotColor: 'orange',
        details: 'มีรายการแจ้งชำระเงินค่าเช่าประจำเดือนมิถุนายนแนบสลิปเข้ามาใหม่จำนวน 2 รายการ ได้แก่ ห้อง 108 (ยอด 4,850 บาท) และ ห้อง 312 (ยอด 5,200 บาท) รอดำเนินการตรวจสอบความถูกต้องและออกใบเสร็จรับเงิน',
        tenantName: 'ห้อง 108: มนัสวี / ห้อง 312: กิตติศักดิ์',
        phone: '089-111-2233',
        actionLink: '/invoices',
        actionLabel: 'ดูรายการใบแจ้งหนี้',
    },
    {
        id: 3,
        title: 'แจ้งซ่อมใหม่',
        subtitle: 'ห้อง 101 — น้ำรั่ว (ด่วน)',
        room: '101',
        date: 'วันนี้ 10:20 น.',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 ชั่วโมงที่แล้ว
        type: 'repair',
        typeLabel: 'แจ้งซ่อม',
        dotColor: 'green',
        details: 'ผู้เช่าห้อง 101 ส่งเรื่องแจ้งซ่อมฉุกเฉิน: ท่อน้ำใต้อ่างล้างหน้าในห้องน้ำรั่วซึม มีน้ำไหลนองเต็มพื้นห้องน้ำ ต้องการให้ช่างเข้าทำการตรวจสอบและซ่อมแซมโดยด่วนที่สุด',
        tenantName: 'อนุชา เก่งการ',
        phone: '084-555-6677',
        actionLink: '/repairs',
        actionLabel: 'ไปที่ระบบแจ้งซ่อม',
    },
    {
        id: 4,
        title: 'รอตรวจสอบสลิป',
        subtitle: 'ห้อง 203 — รอยืนยัน',
        room: '203',
        date: '5 มิ.ย. 68',
        createdAt: '2026-06-05T18:30:00', // เกิน 1 วัน แต่ไม่เกินปี -> '5 มิ.ย.'
        type: 'payment',
        typeLabel: 'การเงิน & ใบแจ้งหนี้',
        dotColor: 'gray',
        details: 'ห้อง 203 ส่งหลักฐานการโอนเงินค่าเช่าห้องและค่าน้ำ-ไฟ ยอดรวม 4,500 บาท เมื่อวานนี้ ตรวจสอบความถูกต้องเรียบร้อยแล้ว รอยืนยันขั้นสุดท้ายในระบบ',
        tenantName: 'ณภัทร สุขสม',
        phone: '086-777-8899',
        actionLink: '/invoices',
        actionLabel: 'ดูรายการใบแจ้งหนี้',
    },
    {
        id: 5,
        title: 'แจ้งซ่อมใหม่',
        subtitle: 'ห้อง 104 — หลอดไฟขาด',
        room: '104',
        date: '4 มิ.ย. 68',
        createdAt: '2026-06-04T14:15:00', // เกิน 1 วัน แต่ไม่เกินปี -> '4 มิ.ย.'
        type: 'repair',
        typeLabel: 'แจ้งซ่อม',
        dotColor: 'gray',
        details: 'ผู้เช่าห้อง 104 แจ้งเปลี่ยนหลอดไฟเพดานห้องนอนขาด 1 จุด ได้รับเรื่องและจัดคิวให้ช่างอาคารเข้าเปลี่ยนให้ในช่วงบ่ายเรียบร้อยแล้ว',
        tenantName: 'ธีรเดช บูรณะ',
        phone: '082-333-4455',
        actionLink: '/repairs',
        actionLabel: 'ไปที่ระบบแจ้งซ่อม',
    },
    {
        id: 6,
        title: 'สัญญาใกล้หมดอายุ',
        subtitle: 'ห้อง 201 — สิ้นสุด 30 มิ.ย. 68',
        room: '201',
        date: '30 มิ.ย. 68',
        createdAt: '2025-06-30T10:00:00', // เกิน 1 ปี -> '30 มิ.ย. 68'
        type: 'contract',
        typeLabel: 'สัญญาเช่า',
        dotColor: 'gray',
        details: 'สัญญาเช่าห้อง 201 จะครบกำหนดในวันที่ 30 มิถุนายน 2568 เจ้าหน้าที่ได้ติดต่อสอบถามผู้เช่าเบื้องต้นแล้ว ผู้เช่าแจ้งความประสงค์ขอต่อสัญญาอีก 1 ปี อยู่ระหว่างเตรียมเอกสารสัญญาใหม่',
        tenantName: 'วนิดา สดใส',
        phone: '089-876-5432',
        actionLink: '/tenants',
        actionLabel: 'ดูข้อมูลผู้เช่าห้อง 201',
    },
]

export const dotColorClasses = {
    red: 'bg-[#ef4444]',
    orange: 'bg-[#f59e0b]',
    green: 'bg-[#22c55e]',
    gray: 'bg-[#6b7280]',
}
