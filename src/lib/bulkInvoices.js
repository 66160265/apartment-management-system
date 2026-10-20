import { calcInvoice, lateFeeSnapshot } from './billing'

// กรอกมิเตอร์ทั้งเดือนในตารางเดียว (components/BulkInvoiceForm.jsx): ตรรกะล้วน ๆ แยกไว้ให้ทดสอบได้

// เลขมิเตอร์ล่าสุดของห้องก่อนเดือนที่จะออกใบ (ใบของเดือนล่าสุดที่เก่ากว่า month) ไม่มีใบก่อนหน้า = 0
export function previousMeters(invoices, room, month) {
    const last = invoices
        .filter((i) => i.room === room && i.month < month)
        .sort((a, b) => b.month.localeCompare(a.month))[0]
    return { water: last?.water_curr ?? 0, elec: last?.elec_curr ?? 0 }
}

// แถวของตาราง: ผู้เช่าทุกห้อง เรียงตามเลขห้อง พร้อมค่าเช่า มิเตอร์ก่อนหน้า และสถานะ (มีใบเดือนนี้แล้ว / ไม่มีบัญชีผู้เช่า)
// tenants = [{ room, name, user_id }], rents = { ห้อง: ค่าเช่า }
export function buildBulkRows({ tenants, rents, invoices, month }) {
    return [...tenants]
        .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
        .map((t) => {
            const prev = previousMeters(invoices, t.room, month)
            return {
                room: t.room,
                name: t.name,
                userId: t.user_id,
                rent: Number(rents[t.room] ?? 0),
                exists: invoices.some((i) => i.room === t.room && i.month === month),
                noAccount: !t.user_id,
                waterPrev: prev.water,
                elecPrev: prev.elec,
            }
        })
}

const isBlank = (v) => v === '' || v === null || v === undefined
const num = (v) => (isBlank(v) ? NaN : Number(v))

// ตรวจแถวที่กรอก: input = { waterPrev, waterCurr, elecPrev, elecCurr } (สตริงจากช่องกรอก)
// state: skip (ไม่ต้องสร้าง: มีใบแล้ว/ไม่มีบัญชี), empty (ยังไม่กรอก ข้าม), invalid (กรอกไม่ถูก มี error), ready (พร้อมสร้าง มี calc)
export function evaluateRow(row, input, rates) {
    if (row.exists) return { state: 'skip', reason: 'มีใบแจ้งหนี้เดือนนี้แล้ว' }
    if (row.noAccount) return { state: 'skip', reason: 'ยังไม่มีบัญชีผู้เช่า' }

    const waterCurr = input?.waterCurr
    const elecCurr = input?.elecCurr
    if (isBlank(waterCurr) && isBlank(elecCurr)) return { state: 'empty' }
    if (isBlank(waterCurr) || isBlank(elecCurr)) return { state: 'invalid', error: 'กรอกมิเตอร์น้ำและไฟให้ครบ' }

    const waterPrev = isBlank(input.waterPrev) ? row.waterPrev : num(input.waterPrev)
    const elecPrev = isBlank(input.elecPrev) ? row.elecPrev : num(input.elecPrev)
    const values = [waterPrev, num(waterCurr), elecPrev, num(elecCurr)]
    if (values.some((n) => !Number.isFinite(n) || n < 0)) return { state: 'invalid', error: 'มิเตอร์ต้องเป็นตัวเลขที่ไม่ติดลบ' }
    if (values.some((n) => !Number.isInteger(n))) return { state: 'invalid', error: 'มิเตอร์ต้องเป็นจำนวนเต็ม' }
    if (values[1] < values[0] || values[3] < values[2]) return { state: 'invalid', error: 'มิเตอร์ปัจจุบันน้อยกว่าก่อนหน้า' }

    const calc = calcInvoice({
        rent: row.rent,
        waterPrev: values[0],
        waterCurr: values[1],
        elecPrev: values[2],
        elecCurr: values[3],
        waterRate: Number(rates.waterRate),
        elecRate: Number(rates.elecRate),
        commonFee: Number(rates.commonFee),
    })
    return { state: 'ready', calc, meters: { waterPrev: values[0], waterCurr: values[1], elecPrev: values[2], elecCurr: values[3] } }
}

// ตรวจอัตราค่าบริการที่ใช้กับทุกห้อง คืนข้อความ error หรือสตริงว่าง
export function validateRates(rates) {
    for (const [key, label] of [['waterRate', 'ค่าน้ำ'], ['elecRate', 'ค่าไฟ'], ['commonFee', 'ค่าส่วนกลาง']]) {
        const n = Number(rates[key])
        if (isBlank(rates[key]) || !Number.isFinite(n) || n < 0) return `${label}ต้องเป็นตัวเลขที่ไม่ติดลบ`
    }
    return ''
}

// แถวที่จะบันทึกลงตาราง invoices (โครงเดียวกับการสร้างทีละใบใน AdminInvoices)
export function buildInvoiceRecord(row, evaluated, { month, rates, settings }) {
    const m = evaluated.meters
    return {
        room: row.room,
        user_id: row.userId,
        tenant_name: row.name,
        month,
        rent: row.rent,
        water_prev: m.waterPrev,
        water_curr: m.waterCurr,
        water_rate: Number(rates.waterRate),
        elec_prev: m.elecPrev,
        elec_curr: m.elecCurr,
        elec_rate: Number(rates.elecRate),
        common_fee: Number(rates.commonFee),
        total: evaluated.calc.total,
        // ค่าปรับล่าช้า: จำค่าตั้งค่า ณ วันออกใบ (ไม่คิดค่าปรับ = ไม่มีฟิลด์เพิ่ม)
        ...lateFeeSnapshot(settings, month),
    }
}

// สรุปทั้งตาราง: แถวพร้อมสร้าง แถวที่กรอกผิด และยอดรวม
export function summarize(rows, inputs, rates, context) {
    const records = []
    const errors = {}
    let total = 0
    for (const row of rows) {
        const ev = evaluateRow(row, inputs[row.room], rates)
        if (ev.state === 'invalid') errors[row.room] = ev.error
        if (ev.state === 'ready') {
            records.push(buildInvoiceRecord(row, ev, context))
            total += ev.calc.total
        }
    }
    return { records, errors, total }
}
