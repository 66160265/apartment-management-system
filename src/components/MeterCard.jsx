import Icon from './Icon'
import { baht } from '../lib/billing'
import { smallInputClass } from './invoiceFormClasses'

// การ์ดกรอกมิเตอร์ของน้ำ/ไฟ พร้อมสรุปหน่วยที่ใช้
function MeterCard({ icon, tone, title, prefix, form, set, units, cost }) {
    // prefix = 'water' หรือ 'elec' ใช้อ่านค่าของมิเตอร์นั้นจากฟอร์ม
    const curr = form[`${prefix}Curr`]
    const prev = form[`${prefix}Prev`]
    return (
        <div className="rounded-2xl border border-line bg-sand/40 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 font-medium text-primary-dark">
                <span className={`grid place-items-center w-8 h-8 rounded-lg ${tone}`}><Icon name={icon} className="w-[18px] h-[18px]" /></span>
                {title}
            </div>
            {/* หน่วยปัจจุบัน (ตัวใหญ่ กรอกบ่อยสุด) */}
            <label className="text-xs text-muted">
                หน่วยปัจจุบัน
                <input
                    type="number"
                    min={prev}
                    className="w-full border border-line bg-white rounded-xl px-3 py-2 mt-1 text-lg font-medium text-ink outline-none focus:border-secondary"
                    value={curr}
                    onChange={set(`${prefix}Curr`)}
                    placeholder="0"
                />
            </label>
            {/* หน่วยก่อนหน้า และราคาต่อหน่วย */}
            <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted">
                    หน่วยก่อนหน้า
                    <input type="number" min="0" className={smallInputClass} value={prev} onChange={set(`${prefix}Prev`)} />
                </label>
                <label className="text-xs text-muted">
                    ราคา/หน่วย (฿)
                    <input type="number" min="0" step="any" className={smallInputClass} value={form[`${prefix}Rate`]} onChange={set(`${prefix}Rate`)} />
                </label>
            </div>
            {/* สรุปหน่วยที่ใช้และค่าใช้จ่าย */}
            <div className="flex justify-between text-xs pt-2 border-t border-line/80">
                <span className="text-muted">ใช้ไป {units} หน่วย</span>
                <span className="font-medium text-primary-dark">{baht(cost)}</span>
            </div>
        </div>
    )
}

export default MeterCard
