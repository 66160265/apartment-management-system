// ดาวน์โหลดข้อความ CSV เป็นไฟล์ (ใส่ BOM นำหน้าเพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง) ใช้ในหน้ารายงาน
export function downloadCsv(filename, csv) {
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}
