import { createElement } from 'react'
import { invoiceCode } from './billing'
import { supabase } from './supabaseClient'
import { loadSettings } from './useSettings'

const A4 = { width: 210, height: 297 } // มิลลิเมตร
const PAGE_PX = 794 // ความกว้างเอกสารในหน้าเว็บ (A4 ที่ 96 dpi)

// ฟอนต์ไทยถูกแบ่งเป็นชุดตามช่วงอักษร ต้องระบุข้อความไทยตอนสั่งโหลด ไม่งั้นจะโหลดเฉพาะชุดตัวอักษรละติน
const THAI_SAMPLE = 'กขคงจฉชซญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ ะาิีึืุูเแโใไ่้๊๋็์ 0123456789'

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/**
 * สร้างไฟล์ PDF ใบแจ้งหนี้แล้วดาวน์โหลดลงเครื่องทันที (ไม่ผ่านหน้าต่างพิมพ์)
 * ไลบรารีสร้าง PDF โหลดเมื่อกดดาวน์โหลดครั้งแรกเท่านั้น เพื่อไม่ให้หน้าเว็บหนักตอนเปิด
 * @param {object} invoice แถวใบแจ้งหนี้จากตาราง invoices
 * @returns {Promise<string>} ชื่อไฟล์ที่บันทึก
 */
export async function downloadInvoicePdf(invoice) {
    const [{ toCanvas }, { jsPDF }, { createRoot }, { default: InvoiceDocument }, { generatePromptPayQR }, settings, tenantRes, roomRes] =
        await Promise.all([
            import('html-to-image'),
            import('jspdf'),
            import('react-dom/client'),
            import('../components/InvoiceDocument'),
            import('./promptpay'),
            loadSettings(),
            supabase.from('tenants').select('name, phone').eq('room', invoice.room).maybeSingle(),
            supabase.from('rooms').select('floor').eq('number', invoice.room).maybeSingle(),
        ])

    // QR พร้อมเพย์ระบุยอดตามใบแจ้งหนี้ (ใบที่ชำระแล้วไม่ต้องมี) ถ้ารหัสพร้อมเพย์ยังไม่ถูกต้องก็ออกเอกสารต่อได้โดยไม่มี QR
    const qr =
        invoice.status === 'paid' ? null : await generatePromptPayQR(settings.promptpayId, invoice.total, { width: 480 }).catch(() => null)

    const paidAt = invoice.reviewed_at
        ? new Date(invoice.reviewed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : ''

    // เรนเดอร์เอกสารไว้นอกจอ แล้วแปลงเป็นรูปทีละส่วน
    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_PX}px;background:#ffffff;pointer-events:none;`
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
        root.render(
            createElement(InvoiceDocument, {
                invoice,
                tenant: tenantRes.data,
                floor: roomRes.data?.floor,
                settings,
                qr,
                paidAt,
            })
        )
        await nextFrame()
        await Promise.all([400, 600, 700].map((w) => document.fonts.load(`${w} 14px "Noto Sans Thai"`, THAI_SAMPLE)))
        await document.fonts.ready
        await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))

        // html-to-image ให้เบราว์เซอร์จัดวางข้อความเอง (ตัวอักษรไทยจึงตรงกับที่เห็น) และฝังฟอนต์เว็บลงในรูปให้
        const options = { pixelRatio: 3, backgroundColor: '#ffffff', skipAutoScale: true }
        await toCanvas(host.firstElementChild, options) // รอบแรกให้ฟอนต์/รูปถูกฝังก่อน (เบราว์เซอร์บางตัววาดรอบแรกไม่ครบ)
        const canvas = await toCanvas(host.firstElementChild, options)

        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
        const image = canvas.toDataURL('image/jpeg', 0.93)
        const imageHeight = (canvas.height * A4.width) / canvas.width

        // เนื้อหายาวเกินหนึ่งหน้า (ไม่ค่อยเกิด) ให้ต่อหน้าถัดไปโดยเลื่อนรูปขึ้น
        for (let offset = 0, page = 0; offset < imageHeight - 0.5; offset += A4.height, page++) {
            if (page > 0) pdf.addPage()
            pdf.addImage(image, 'JPEG', 0, -offset, A4.width, imageHeight, undefined, 'FAST')
        }

        const code = invoiceCode(invoice)
        pdf.setProperties({ title: `ใบแจ้งหนี้ ${code}`, subject: `ใบแจ้งหนี้ห้อง ${invoice.room}`, author: settings.apartmentName })
        const filename = `${code}.pdf`
        pdf.save(filename)
        return filename
    } finally {
        root.unmount()
        host.remove()
    }
}
