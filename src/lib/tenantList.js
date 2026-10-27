import { supabase } from './supabaseClient'
import { REQUIRED_DOCS, contractStatus } from './tenants'

// ตรรกะของหน้ารายชื่อผู้เช่าฝั่งแอดมิน (pages/TenantsPage.jsx) แยกไว้ให้ทดสอบได้

// เรียงผู้เช่าตามเลขห้องแบบตัวเลข
export const byRoom = (a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })

// แปลงแถวจากตาราง tenants เป็นออบเจ็กต์ที่หน้าเว็บใช้ (ชื่อ field แบบ camelCase)
export const fromRow = (r) => ({
    room: r.room,
    name: r.name,
    phone: r.phone,
    username: r.username,
    startDate: r.start_date,
    endDate: r.end_date,
    userId: r.user_id,
    // เงินประกัน (คอลัมน์มีเมื่อรัน supabase/migrations/20261022000000_initial_schema.sql (ส่วน move-out) แล้ว ยังไม่มี = 0)
    deposit: Number(r.deposit ?? 0),
})

// ดึงข้อมูลผู้เช่า ห้อง และเอกสารผู้เช่าพร้อมกัน
export const fetchTenantsData = () =>
    Promise.all([
        supabase.from('tenants').select('*'),
        supabase.from('rooms').select('number, status, floor'),
        supabase.from('tenant_documents').select('room, type'),
    ])

// แท็บกรองรายชื่อ: ทั้งหมด / ใกล้หมดสัญญา / หมดสัญญา / เอกสารไม่ครบ
export const tenantTabs = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'expiring', label: 'ใกล้หมดสัญญา', short: 'ใกล้หมด' },
    { value: 'expired', label: 'หมดสัญญา', short: 'หมดแล้ว' },
    { value: 'docs', label: 'เอกสารไม่ครบ', short: 'ขาดเอกสาร' },
]

// จำนวนเอกสารหลักที่อัปโหลดแล้วต่อห้อง (นับเฉพาะประเภทที่ต้องมี) docs = แถวจากตาราง tenant_documents
export function countRequiredDocs(docs) {
    const counts = {}
    const required = REQUIRED_DOCS.map((d) => d.type)
    for (const d of docs ?? []) {
        if (required.includes(d.type)) counts[d.room] = (counts[d.room] ?? 0) + 1
    }
    return counts
}

// ผู้เช่ามีเอกสารหลักครบทุกประเภทหรือยัง
export const docsComplete = (docCounts, tenant) => (docCounts[tenant.room] ?? 0) >= REQUIRED_DOCS.length

// เงื่อนไขของแต่ละแท็บ
export const matchesTab = (tab, tenant, docCounts) => {
    if (tab === 'expiring') return contractStatus(tenant.endDate).key === 'expiring'
    if (tab === 'expired') return contractStatus(tenant.endDate).key === 'expired'
    if (tab === 'docs') return !docsComplete(docCounts, tenant)
    return true
}

// จำนวนผู้เช่าในแต่ละแท็บ
export const tabCounts = (tenants, docCounts) =>
    Object.fromEntries(tenantTabs.map((x) => [x.value, tenants.filter((t) => matchesTab(x.value, t, docCounts)).length]))

// กรองตามแท็บ แล้วค้นหาจากชื่อ เลขห้อง หรือเบอร์โทร (เทียบเฉพาะตัวเลข)
export function filterTenants(tenants, { tab, search, docCounts }) {
    const keyword = search.trim().toLowerCase()
    const keywordDigits = keyword.replace(/\D/g, '')
    return tenants
        .filter((t) => matchesTab(tab, t, docCounts))
        .filter((t) =>
            !keyword ||
            t.name.toLowerCase().includes(keyword) ||
            t.room.includes(keyword) ||
            (keywordDigits && t.phone.replace(/\D/g, '').includes(keywordDigits)))
}
