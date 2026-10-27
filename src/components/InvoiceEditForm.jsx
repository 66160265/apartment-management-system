import MeterCard from './MeterCard'
import MonthPicker from './MonthPicker'
import { InvoiceBreakdown } from './InvoiceParts'
import { inputClass } from './invoiceFormClasses'
import { baht, paidOf } from '../lib/billing'

// ฟอร์มแก้ไขใบแจ้งหนี้ของแอดมิน: ซ้าย = กรอกข้อมูล, ขวา = สรุปยอด (components/AdminInvoices.jsx)
// สร้างใบแจ้งหนี้ใช้ปุ่ม "สร้างใบแจ้งหนี้" (ตารางกรอกมิเตอร์) ฟอร์มนี้จึงแสดงเฉพาะตอนแก้ไขใบที่สร้างไปแล้ว
// values = ผลของ invoiceFormValues() (view, tenant, editing, rent, numbers, calc)
function InvoiceEditForm({ form, setForm, values, formError, setFormError, saving, tenants, invoices, editingId, onRoomChange, onSubmit, onCancel }) {
    const { view, tenant, editing, rent, numbers, calc } = values

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key และล้างข้อความ error
    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setFormError('')
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
            <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
                {/* หัวฟอร์ม + เลือกเดือน (เดือนที่ห้องนี้มีใบแล้วมีจุด; ตอนแก้ไขเปลี่ยนเดือนไม่ได้) */}
                <div className="flex flex-wrap justify-between items-center gap-3">
                    <h2 className="font-medium text-primary-dark">
                        แก้ไขใบแจ้งหนี้ ห้อง {form.room}
                    </h2>
                    <MonthPicker
                        value={form.month}
                        onChange={(month) => { setForm({ ...form, month }); setFormError('') }}
                        marked={invoices.filter((i) => i.room === form.room && i.id !== editingId).map((i) => i.month)}
                        disabled={!!editingId}
                    />
                </div>
                {/* เลือกห้อง (เลือกแล้วดึงเลขมิเตอร์ครั้งก่อนมาให้อัตโนมัติ) */}
                <label className="text-sm text-muted">
                    ห้องพัก
                    <select className={inputClass} value={form.room} onChange={onRoomChange} disabled={!!editingId}>
                        <option value="">เลือกห้อง...</option>
                        {tenants.map((t) => (
                            <option key={t.room} value={t.room}>{t.room} - {t.name}</option>
                        ))}
                    </select>
                </label>
                {/* การ์ดมิเตอร์น้ำ และมิเตอร์ไฟ */}
                <div className="grid sm:grid-cols-2 gap-4">
                    <MeterCard icon="droplet" tone="bg-cyan-50 text-cyan-700" title="มิเตอร์น้ำ" prefix="water" form={view} set={set} units={calc.waterUnits} cost={calc.water} />
                    <MeterCard icon="bolt" tone="bg-amber-50 text-amber-700" title="มิเตอร์ไฟ" prefix="elec" form={view} set={set} units={calc.elecUnits} cost={calc.elec} />
                </div>
                {/* ค่าส่วนกลาง */}
                <label className="text-sm text-muted sm:w-1/2">
                    ค่าส่วนกลาง (฿)
                    <input type="number" min="0" step="any" className={inputClass} value={view.commonFee} onChange={set('commonFee')} />
                </label>
            </div>

            {/* สรุปยอดแบบสด (ติดหน้าจอบนจอใหญ่) */}
            <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4 xl:sticky xl:top-6">
                <div className="flex justify-between items-baseline gap-3">
                    <h2 className="font-medium text-primary-dark">สรุปยอด</h2>
                    <span className="text-xs text-muted truncate">
                        {tenant ? `ห้อง ${tenant.room} · ${tenant.name}` : 'ยังไม่ได้เลือกห้อง'}
                    </span>
                </div>
                <InvoiceBreakdown
                    invoice={{
                        rent,
                        water_prev: numbers.waterPrev,
                        water_curr: form.waterCurr === '' ? numbers.waterPrev : numbers.waterCurr,
                        water_rate: numbers.waterRate || 0,
                        elec_prev: numbers.elecPrev,
                        elec_curr: form.elecCurr === '' ? numbers.elecPrev : numbers.elecCurr,
                        elec_rate: numbers.elecRate || 0,
                        common_fee: numbers.commonFee || 0,
                        total: calc.total || 0,
                    }}
                />
                {/* เตือนเมื่อแก้ใบที่ส่งสลิปหรือจ่ายแล้ว */}
                {editing && editing.status !== 'pending' && (
                    <p className="text-sm text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-2">
                        {paidOf(editing) > 0
                            ? `ใบแจ้งหนี้นี้ได้รับชำระแล้ว ${baht(paidOf(editing))} แก้ไขยอดรวมไม่ได้ (แก้ได้เฉพาะรายการที่ไม่ทำให้ยอดรวมเปลี่ยน)`
                            : `ใบแจ้งหนี้นี้${editing.status === 'review' ? 'มีสลิปรอตรวจสอบ' : 'ชำระแล้ว'} หากเปลี่ยนยอดรวม ยอดอาจไม่ตรงกับสลิปที่ผู้เช่าโอนมา`}
                    </p>
                )}
                {/* ข้อความ error และปุ่มยกเลิก/สร้าง/บันทึก */}
                {formError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{formError}</p>}
                <div className="flex gap-3">
                    {editingId && (
                        <button type="button" onClick={onCancel} className="flex-1 border border-line text-muted hover:bg-sand py-2.5 rounded-xl">ยกเลิก</button>
                    )}
                    <button type="submit" disabled={saving} className="flex-[2] bg-primary hover:bg-primary-dark disabled:opacity-60 text-white py-2.5 rounded-xl font-medium shadow-card">
                        {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'สร้างใบแจ้งหนี้'}
                    </button>
                </div>
            </div>
        </form>
    )
}

export default InvoiceEditForm
