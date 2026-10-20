import { useMemo, useState } from 'react'
import Icon from './Icon'
import MonthPicker from './MonthPicker'
import { baht, currentMonth, formatMonth } from '../lib/billing'
import { buildBulkRows, evaluateRow, summarize, validateRates } from '../lib/bulkInvoices'
import { supabase } from '../lib/supabaseClient'

// กรอกมิเตอร์น้ำ/ไฟของทุกห้องในตารางเดียว แล้วสร้างใบแจ้งหนี้ทั้งเดือนในครั้งเดียว (ตรรกะอยู่ที่ lib/bulkInvoices.js)
// มิเตอร์ก่อนหน้าดึงจากใบเดือนล่าสุดของห้องให้เอง กด Enter ในช่องเพื่อเลื่อนลงห้องถัดไป
// ห้องที่ไม่กรอกอะไรจะถูกข้าม ห้องที่มีใบเดือนนี้แล้วหรือไม่มีบัญชีผู้เช่าจะกรอกไม่ได้

const cellInput = 'w-20 border border-line bg-white rounded-lg px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-secondary'
const prevInput = 'w-16 border border-transparent bg-transparent rounded px-1 py-1 text-right text-xs text-muted tabular-nums outline-none hover:border-line focus:border-secondary focus:bg-white'
const rateInput = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

function BulkInvoiceForm({ tenants, rents, invoices, settings, onDone, onCancel }) {
    const [month, setMonth] = useState(currentMonth())
    // อัตราที่ใช้กับทุกห้องในรอบนี้ (ค่าเริ่มต้นจากหน้าตั้งค่า แก้ได้)
    const [rates, setRates] = useState({ waterRate: String(settings.rateWater), elecRate: String(settings.rateElectric), commonFee: String(settings.commonFee) })
    // ค่าที่กรอก: { ห้อง: { waterPrev, waterCurr, elecPrev, elecCurr } }
    const [inputs, setInputs] = useState({})
    const [confirming, setConfirming] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const rows = useMemo(() => buildBulkRows({ tenants, rents, invoices, month }), [tenants, rents, invoices, month])
    const rateError = validateRates(rates)
    const context = useMemo(() => ({ month, rates, settings }), [month, rates, settings])
    const summary = useMemo(() => (rateError ? { records: [], errors: {}, total: 0 } : summarize(rows, inputs, rates, context)), [rows, inputs, rates, context, rateError])
    const errorCount = Object.keys(summary.errors).length
    const createdAlready = rows.filter((r) => r.exists).length

    const setCell = (room, key, value) => {
        setInputs((prev) => ({ ...prev, [room]: { ...prev[room], [key]: value } }))
        setConfirming(false)
        setError('')
    }

    // เปลี่ยนเดือน: มิเตอร์ก่อนหน้าเปลี่ยนตาม จึงล้างค่าที่กรอกไว้
    const changeMonth = (m) => {
        setMonth(m)
        setInputs({})
        setConfirming(false)
        setError('')
    }

    // Enter = ไปช่องเดียวกันของห้องถัดไป (ข้ามห้องที่กรอกไม่ได้)
    const onEnter = (e, col) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const all = [...document.querySelectorAll(`[data-bulk-col="${col}"]`)]
        const next = all[all.indexOf(e.currentTarget) + 1]
        if (next) {
            next.focus()
            next.select?.()
        }
    }

    const create = async () => {
        setSaving(true)
        setError('')
        const { error: err } = await supabase.from('invoices').insert(summary.records)
        setSaving(false)
        if (err) {
            setConfirming(false)
            setError(err.code === '23505'
                ? 'บางห้องมีใบแจ้งหนี้เดือนนี้แล้ว (อาจถูกสร้างระหว่างที่กรอก) ยังไม่ได้สร้างใบใด ๆ กรุณากลับไปรายการแล้วเปิดใหม่'
                : `สร้างใบแจ้งหนี้ไม่สำเร็จ: ${err.message}`)
            return
        }
        await onDone(summary.records.length)
    }

    const unitsOf = (curr, prev) => {
        const n = Number(curr) - Number(prev)
        return curr === '' || curr === undefined || !Number.isFinite(n) || n < 0 ? '' : n
    }

    return (
        <div className="px-4 sm:px-6 pb-8 flex flex-col gap-4">
            <button onClick={onCancel} className="self-start flex items-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3.5 py-1.5 rounded-xl text-sm">
                <Icon name="arrowLeft" className="w-4 h-4" />กลับไปรายการใบแจ้งหนี้
            </button>

            {/* เดือนและอัตราค่าบริการของรอบนี้ */}
            <div className="bg-white rounded-2xl shadow-card p-5 grid gap-4 md:grid-cols-[auto_1fr] items-start">
                <div>
                    <div className="text-sm text-muted mb-1">เดือนของใบแจ้งหนี้</div>
                    <MonthPicker value={month} onChange={changeMonth} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm text-muted">ค่าน้ำ (บาท/หน่วย)
                        <input type="number" min="0" step="any" className={rateInput} value={rates.waterRate} onChange={(e) => setRates({ ...rates, waterRate: e.target.value })} />
                    </label>
                    <label className="text-sm text-muted">ค่าไฟ (บาท/หน่วย)
                        <input type="number" min="0" step="any" className={rateInput} value={rates.elecRate} onChange={(e) => setRates({ ...rates, elecRate: e.target.value })} />
                    </label>
                    <label className="text-sm text-muted">ค่าส่วนกลาง (บาท)
                        <input type="number" min="0" step="any" className={rateInput} value={rates.commonFee} onChange={(e) => setRates({ ...rates, commonFee: e.target.value })} />
                    </label>
                </div>
                {rateError && <p className="md:col-span-2 text-sm text-red-600">{rateError}</p>}
            </div>

            <p className="text-sm text-muted">
                กรอกเลขมิเตอร์ปัจจุบันของแต่ละห้อง (มิเตอร์ก่อนหน้าดึงจากใบเดือนล่าสุดให้ แก้ได้ถ้าเปลี่ยนมิเตอร์) กด Enter เพื่อไปห้องถัดไป ห้องที่ไม่กรอกจะถูกข้าม
                {createdAlready > 0 && ` · เดือน ${formatMonth(month)} มีใบแจ้งหนี้แล้ว ${createdAlready} ห้อง`}
            </p>

            {rows.length === 0 ? (
                <p className="text-center py-10 text-muted">ยังไม่มีผู้เช่า</p>
            ) : (
                <div className="bg-white rounded-2xl shadow-card overflow-x-auto">
                    <table className="w-full text-sm min-w-[880px]">
                        <thead>
                            <tr className="text-left text-muted border-b border-line">
                                <th className="px-3 py-3">ห้อง / ผู้เช่า</th>
                                <th className="px-3 py-3 text-right">ค่าเช่า</th>
                                <th className="px-3 py-3 text-right">น้ำ ก่อนหน้า</th>
                                <th className="px-3 py-3 text-right">น้ำ ปัจจุบัน</th>
                                <th className="px-3 py-3 text-right">หน่วย</th>
                                <th className="px-3 py-3 text-right">ไฟ ก่อนหน้า</th>
                                <th className="px-3 py-3 text-right">ไฟ ปัจจุบัน</th>
                                <th className="px-3 py-3 text-right">หน่วย</th>
                                <th className="px-3 py-3 text-right">ยอดรวม</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const input = inputs[r.room] ?? {}
                                const ev = evaluateRow(r, input, rates)
                                const disabled = ev.state === 'skip'
                                const rowError = summary.errors[r.room]
                                return (
                                    <tr key={r.room} className={`border-b border-line/60 ${disabled ? 'bg-slate-50 text-muted' : rowError ? 'bg-red-50/60' : ev.state === 'ready' ? 'bg-emerald-50/40' : ''}`}>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-ink">{r.room} <span className="font-normal text-muted">· {r.name}</span></div>
                                            {disabled && <div className="text-xs">{ev.reason}</div>}
                                            {rowError && <div className="text-xs text-red-600">{rowError}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">{baht(r.rent)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <input aria-label={`ห้อง ${r.room} มิเตอร์น้ำก่อนหน้า`} className={prevInput} disabled={disabled} inputMode="numeric"
                                                value={input.waterPrev ?? String(r.waterPrev)} onChange={(e) => setCell(r.room, 'waterPrev', e.target.value)} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <input aria-label={`ห้อง ${r.room} มิเตอร์น้ำปัจจุบัน`} className={cellInput} disabled={disabled} inputMode="numeric" data-bulk-col="water"
                                                value={input.waterCurr ?? ''} onChange={(e) => setCell(r.room, 'waterCurr', e.target.value)} onKeyDown={(e) => onEnter(e, 'water')} />
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-muted">{ev.state === 'ready' ? ev.calc.waterUnits : unitsOf(input.waterCurr, input.waterPrev ?? r.waterPrev)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <input aria-label={`ห้อง ${r.room} มิเตอร์ไฟก่อนหน้า`} className={prevInput} disabled={disabled} inputMode="numeric"
                                                value={input.elecPrev ?? String(r.elecPrev)} onChange={(e) => setCell(r.room, 'elecPrev', e.target.value)} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <input aria-label={`ห้อง ${r.room} มิเตอร์ไฟปัจจุบัน`} className={cellInput} disabled={disabled} inputMode="numeric" data-bulk-col="elec"
                                                value={input.elecCurr ?? ''} onChange={(e) => setCell(r.room, 'elecCurr', e.target.value)} onKeyDown={(e) => onEnter(e, 'elec')} />
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-muted">{ev.state === 'ready' ? ev.calc.elecUnits : unitsOf(input.elecCurr, input.elecPrev ?? r.elecPrev)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary-dark">{ev.state === 'ready' ? baht(ev.calc.total) : ''}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            {/* แถบสรุปและปุ่มสร้าง (ต้องกดยืนยันอีกครั้ง เพราะผู้เช่าทุกคนจะได้รับแจ้งเตือนใบแจ้งหนี้ใหม่ทันที) */}
            <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur border-t border-line flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                    <span className="font-medium text-primary-dark">พร้อมสร้าง {summary.records.length} ใบ รวม {baht(summary.total)}</span>
                    {errorCount > 0 && <span className="text-red-600"> · มีแถวที่กรอกไม่ถูกต้อง {errorCount} ห้อง</span>}
                </div>
                <div className="flex gap-2">
                    {confirming ? (
                        <>
                            <button onClick={() => setConfirming(false)} disabled={saving} className="border border-line text-muted hover:bg-sand px-4 py-2 rounded-xl text-sm">ยกเลิก</button>
                            <button onClick={create} disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-5 py-2 rounded-xl text-sm font-medium shadow-card">
                                {saving ? 'กำลังสร้าง...' : `ยืนยันสร้าง ${summary.records.length} ใบ (ผู้เช่าจะได้รับแจ้งเตือนทันที)`}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setConfirming(true)}
                            disabled={summary.records.length === 0 || errorCount > 0 || !!rateError}
                            className="bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-sm font-medium shadow-card"
                        >
                            สร้างใบแจ้งหนี้ {summary.records.length} ใบ
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default BulkInvoiceForm
