import { createElement } from 'react'
import { receiptFileName } from './receipts'
import { supabase } from './supabaseClient'
import { loadSettings } from './useSettings'

// สร้างไฟล์ PDF ใบเสร็จรับเงินแล้วดาวน์โหลดทันที ใช้วิธีเดียวกับ invoicePdf.jsx (เรนเดอร์เอกสารนอกจอ -> รูป -> PDF A4)
// ไลบรารีสร้าง PDF โหลดเมื่อกดดาวน์โหลดครั้งแรกเท่านั้น
const A4 = { width: 210, height: 297 }
const PAGE_PX = 794
const THAI_SAMPLE = 'กขคงจฉชซญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ ะาิีึืุูเแโใไ่้๊๋็์ 0123456789'
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/**
 * @param {object} receipt ข้อมูลใบเสร็จจาก lib/receipts.js
 * @returns {Promise<string>} ชื่อไฟล์ที่บันทึก
 */
export async function downloadReceiptPdf(receipt) {
    const [{ toCanvas }, { jsPDF }, { createRoot }, { default: ReceiptDocument }, settings, tenantRes, roomRes] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
        import('react-dom/client'),
        import('../components/ReceiptDocument'),
        loadSettings(),
        supabase.from('tenants').select('name, phone').eq('room', receipt.room).maybeSingle(),
        supabase.from('rooms').select('floor').eq('number', receipt.room).maybeSingle(),
    ])

    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_PX}px;background:#ffffff;pointer-events:none;`
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
        root.render(createElement(ReceiptDocument, { receipt, tenant: tenantRes.data, floor: roomRes.data?.floor, settings }))
        await nextFrame()
        await Promise.all([400, 600, 700].map((w) => document.fonts.load(`${w} 14px "Noto Sans Thai"`, THAI_SAMPLE)))
        await document.fonts.ready
        await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))

        const options = { pixelRatio: 3, backgroundColor: '#ffffff', skipAutoScale: true }
        await toCanvas(host.firstElementChild, options)
        const canvas = await toCanvas(host.firstElementChild, options)

        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
        const image = canvas.toDataURL('image/jpeg', 0.93)
        const imageHeight = (canvas.height * A4.width) / canvas.width
        for (let offset = 0, page = 0; offset < imageHeight - 0.5; offset += A4.height, page++) {
            if (page > 0) pdf.addPage()
            pdf.addImage(image, 'JPEG', 0, -offset, A4.width, imageHeight, undefined, 'FAST')
        }

        pdf.setProperties({ title: `ใบเสร็จรับเงิน ${receipt.code}`, subject: `ใบเสร็จห้อง ${receipt.room}`, author: settings.apartmentName })
        const filename = receiptFileName(receipt)
        pdf.save(filename)
        return filename
    } finally {
        root.unmount()
        host.remove()
    }
}
