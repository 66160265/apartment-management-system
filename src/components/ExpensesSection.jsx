import { useState } from 'react'
import Icon from './Icon'
import { baht, formatMonth } from '../lib/billing'
import { expenseCategories, utilityMargin } from '../lib/reports'
import { supabase } from '../lib/supabaseClient'

// ค่าใช้จ่ายของหอพักรายเดือน (หน้ารายงาน): เพิ่ม/ลบรายการ ยอดรวม และเทียบค่าน้ำ-ไฟที่เก็บจากผู้เช่ากับบิลที่หอจ่ายจริง
// ตาราง expenses อยู่ใน supabase/migrations/20261025000000_repairs_reports_notifications.sql แอดมินเท่านั้น

const inputClass = 'border border-line bg-sand/50 rounded-xl px-3 py-2 text-sm outline-none focus:border-secondary focus:bg-white'
const emptyForm = { category: 'electric', label: '', amount: '', note: '' }

// ไอคอนและสีของแต่ละประเภทค่าใช้จ่าย (ใช้ในการ์ดรายการ)
const categoryStyle = {
    electric: { icon: 'bolt', color: 'bg-amber-50 text-amber-600' },
    water: { icon: 'droplet', color: 'bg-sky-50 text-sky-600' },
    staff: { icon: 'users', color: 'bg-violet-50 text-violet-600' },
    internet: { icon: 'wifi', color: 'bg-indigo-50 text-indigo-600' },
    maintenance: { icon: 'wrench', color: 'bg-emerald-50 text-emerald-600' },
    other: { icon: 'receipt', color: 'bg-slate-100 text-slate-600' },
}

// บรรทัดเทียบค่าน้ำ/ค่าไฟ: เก็บจากผู้เช่า vs จ่ายจริง และส่วนต่าง (ยังไม่บันทึกบิล = บอกให้บันทึก)
function MarginRow({ label, row }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm py-2">
            <span className="text-ink">{label}</span>
            <span className="text-muted tabular-nums">
                เก็บจากผู้เช่า {baht(row.billed)} ·{' '}
                {row.paid === null ? (
                    <span className="text-amber-700">ยังไม่ได้บันทึกบิลที่หอจ่าย</span>
                ) : (
                    <>
                        จ่ายจริง {baht(row.paid)} ·{' '}
                        <span className={`font-semibold ${row.diff < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {row.diff < 0 ? 'ขาดทุน' : 'กำไร'} {baht(Math.abs(row.diff))}
                        </span>
                    </>
                )}
            </span>
        </div>
    )
}

function ExpensesSection({ month, expenses, invoices, onChanged }) {
    const [form, setForm] = useState(emptyForm)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    // รายการที่กดลบแล้วรอยืนยัน
    const [confirmId, setConfirmId] = useState(null)

    const list = expenses.filter((e) => e.month === month).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const total = list.reduce((acc, e) => acc + Number(e.amount), 0)
    const margin = utilityMargin(invoices, expenses, month)

    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
    }

    // "อื่น ๆ" = ช่องประเภทเปลี่ยนเป็นช่องพิมพ์ชื่อค่าใช้จ่ายเอง (คอลัมน์ label)
    const isOther = form.category === 'other'

    const add = async (e) => {
        e.preventDefault()
        if (isOther && !form.label.trim()) return setError('กรุณาพิมพ์ชื่อค่าใช้จ่าย')
        const amount = Number(form.amount)
        if (!(amount > 0)) return setError('กรุณาใส่จำนวนเงินมากกว่า 0')
        setBusy(true)
        const { error: err } = await supabase.from('expenses').insert({ month, category: form.category, label: isOther ? form.label.trim() : '', amount, note: form.note.trim() })
        setBusy(false)
        if (err) return setError(`บันทึกไม่สำเร็จ: ${err.message}`)
        setForm({ ...emptyForm, category: form.category, label: '' })
        await onChanged()
    }

    const remove = async (id) => {
        setBusy(true)
        const { error: err } = await supabase.from('expenses').delete().eq('id', id)
        setBusy(false)
        setConfirmId(null)
        if (err) return setError(`ลบไม่สำเร็จ: ${err.message}`)
        await onChanged()
    }

    return (
        <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium text-primary-dark">ค่าใช้จ่ายของหอพัก เดือน {formatMonth(month)}</h2>
                <span className="text-sm text-muted">รวม <span className="font-semibold text-red-700 tabular-nums">{baht(total)}</span></span>
            </div>

            {/* เพิ่มรายการ */}
            <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_1.6fr_auto]">
                {isOther ? (
                    // พิมพ์ชื่อค่าใช้จ่ายเอง กดกากบาทเพื่อกลับไปเลือกจากรายการ
                    <div className="relative">
                        <input
                            className={`${inputClass} w-full pr-9`}
                            maxLength={100}
                            placeholder="พิมพ์ชื่อค่าใช้จ่าย เช่น ค่าประกันอาคาร"
                            aria-label="ชื่อค่าใช้จ่าย"
                            value={form.label}
                            onChange={set('label')}
                            disabled={busy}
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={() => setForm({ ...form, category: emptyForm.category, label: '' })}
                            disabled={busy}
                            aria-label="กลับไปเลือกประเภท"
                            title="กลับไปเลือกประเภท"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink"
                        >
                            <Icon name="close" className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <select className={inputClass} value={form.category} onChange={set('category')} disabled={busy}>
                        {Object.entries(expenseCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                )}
                <input className={`${inputClass} text-right`} type="number" min="0" step="0.01" placeholder="จำนวนเงิน (บาท)" value={form.amount} onChange={set('amount')} disabled={busy} />
                <input className={inputClass} maxLength={200} placeholder="หมายเหตุ (ไม่บังคับ) เช่น บิลเลขที่ 123" value={form.note} onChange={set('note')} disabled={busy} />
                <button type="submit" disabled={busy} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5">
                    <Icon name="plus" className="w-4 h-4" />
                    เพิ่ม
                </button>
            </form>
            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* รายการของเดือนนี้ */}
            {list.length === 0 ? (
                <p className="text-sm text-muted text-center py-3">ยังไม่มีค่าใช้จ่ายของเดือนนี้</p>
            ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    {list.map((e) => {
                        const style = categoryStyle[e.category] ?? categoryStyle.other
                        // "อื่น ๆ" แสดงชื่อที่พิมพ์ไว้แทนชื่อประเภท
                        const name = (e.category === 'other' && e.label) || (expenseCategories[e.category] ?? e.category)
                        const confirming = confirmId === e.id
                        return (
                            <li key={e.id} className={`rounded-xl border p-3 flex items-center gap-3 ${confirming ? 'border-red-200 bg-red-50/60' : 'border-line bg-white'}`}>
                                <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${style.color}`}>
                                    <Icon name={style.icon} className="w-5 h-5" />
                                </span>
                                {confirming ? (
                                    // ยืนยันก่อนลบ
                                    <>
                                        <span className="flex-1 min-w-0 text-red-800">ลบ "{name}" {baht(e.amount)}?</span>
                                        <button type="button" onClick={() => remove(e.id)} disabled={busy} className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">ลบ</button>
                                        <button type="button" onClick={() => setConfirmId(null)} disabled={busy} className="px-2.5 py-1 rounded-lg border border-line bg-white text-xs text-ink hover:bg-sand/60">ยกเลิก</button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex-1 min-w-0">
                                            <span className="block truncate font-medium text-ink">{name}</span>
                                            {e.note && <span className="block truncate text-xs text-muted">{e.note}</span>}
                                        </span>
                                        <span className="tabular-nums font-semibold text-ink whitespace-nowrap">{baht(e.amount)}</span>
                                        <button type="button" onClick={() => setConfirmId(e.id)} disabled={busy} aria-label={`ลบ ${name}`} title="ลบรายการ" className="p-1.5 -mr-1 rounded-lg text-muted hover:text-red-600 hover:bg-red-50">
                                            <Icon name="trash" className="w-4 h-4" />
                                        </button>
                                    </>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}

            {/* ค่าน้ำ-ไฟ: เก็บจากผู้เช่า เทียบกับที่หอจ่ายจริง */}
            <div className="rounded-xl bg-sand/50 border border-line px-4 py-1 divide-y divide-line/60">
                <MarginRow label="ค่าไฟ" row={margin.electric} />
                <MarginRow label="ค่าน้ำ" row={margin.water} />
            </div>
        </section>
    )
}

export default ExpensesSection
