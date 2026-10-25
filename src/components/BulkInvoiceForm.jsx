import { useMemo, useState } from 'react'
import Icon from './Icon'
import Switch from './Switch'
import MonthPicker from './MonthPicker'
import { baht, currentMonth, formatMonth } from '../lib/billing'
import { buildBulkRows, evaluateRow, summarize, validateRates } from '../lib/bulkInvoices'
import { billMonthOf } from '../lib/reports'
import { supabase } from '../lib/supabaseClient'

// กรอกมิเตอร์น้ำ/ไฟของทุกห้องในตารางเดียว แล้วสร้างใบแจ้งหนี้ทั้งเดือนในครั้งเดียว (ตรรกะอยู่ที่ lib/bulkInvoices.js)
// มิเตอร์ก่อนหน้าดึงจากใบเดือนล่าสุดของห้องให้เอง กด Enter ในช่องเพื่อเลื่อนลงห้องถัดไป
// ห้องที่ไม่กรอกอะไรจะถูกข้าม ห้องที่มีใบเดือนนี้แล้วหรือไม่มีบัญชีผู้เช่าจะกรอกไม่ได้

const cellInput = 'w-20 border border-line bg-white rounded-lg px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-secondary'
const prevInput = 'w-16 border border-transparent bg-transparent rounded px-1 py-1 text-right text-xs text-muted tabular-nums outline-none hover:border-line focus:border-secondary focus:bg-white'
const rateInput = 'w-full min-w-0 h-9 sm:h-10 border border-line bg-sand/50 rounded-xl px-3 mt-1 text-ink outline-none focus:border-secondary focus:bg-white'

function BulkInvoiceForm({ tenants, rents, invoices, settings, onDone }) {
    // บิลของเดือนไหนออกในเดือนถัดไป (เช่น 1 ต.ค. ออกบิลเดือน ก.ย.) จึงเริ่มที่เดือนที่แล้ว เปลี่ยนเดือนเองได้
    const [month, setMonth] = useState(() => billMonthOf(currentMonth()))
    // อัตราที่ใช้กับทุกห้องในรอบนี้ (ค่าเริ่มต้นจากหน้าตั้งค่า แก้ได้)
    const [rates, setRates] = useState({ waterRate: String(settings.rateWater), elecRate: String(settings.rateElectric), commonFee: String(settings.commonFee) })
    // ค่าที่กรอก: { ห้อง: { waterPrev, waterCurr, elecPrev, elecCurr } }
    const [inputs, setInputs] = useState({})
    const [confirming, setConfirming] = useState(false)
    // ค้นหาห้อง/ชื่อ และแสดงห้องที่มีใบเดือนนี้แล้วด้วยหรือไม่ (ปกติซ่อนไว้ เหลือเฉพาะห้องที่ยังต้องออกใบ)
    const [search, setSearch] = useState('')
    const [showCreated, setShowCreated] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const rows = useMemo(() => buildBulkRows({ tenants, rents, invoices, month }), [tenants, rents, invoices, month])
    const rateError = validateRates(rates)
    const context = useMemo(() => ({ month, rates, settings }), [month, rates, settings])
    const summary = useMemo(() => (rateError ? { records: [], errors: {}, total: 0 } : summarize(rows, inputs, rates, context)), [rows, inputs, rates, context, rateError])
    const errorCount = Object.keys(summary.errors).length
    const createdAlready = rows.filter((r) => r.exists).length
    // แถวที่แสดง (การซ่อน/ค้นหาไม่กระทบค่าที่กรอกไว้และยอดสรุป)
    const keyword = search.trim().toLowerCase()
    const shownRows = rows.filter((r) => (showCreated || !r.exists) && (!keyword || r.room.toLowerCase().includes(keyword) || r.name.toLowerCase().includes(keyword)))

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
        // นับเฉพาะช่องที่มองเห็น (จอเล็กใช้การ์ด จอใหญ่ใช้ตาราง อีกแบบถูกซ่อนไว้)
        const all = [...document.querySelectorAll(`[data-bulk-col="${col}"]`)].filter((el) => el.offsetParent !== null)
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
            {/* เดือนและอัตราค่าบริการของรอบนี้ */}
            <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 grid gap-3 sm:gap-4 md:grid-cols-[auto_1fr] items-start">
                <div>
                    <div className="text-sm text-muted mb-1">เดือนของใบแจ้งหนี้</div>
                    <MonthPicker value={month} onChange={changeMonth} />
                </div>
                {/* อัตรา 3 ช่องอยู่แถวเดียวกันทุกขนาดจอ (หน่วยอยู่ใต้ชื่อ ไม่ให้ป้ายยาวดันช่อง) */}
                <div className="grid gap-2 sm:gap-3 grid-cols-3">
                    <label className="text-sm text-muted">ค่าน้ำ <span className="block sm:inline text-xs">(บาท/หน่วย)</span>
                        <input type="number" min="0" step="any" className={rateInput} value={rates.waterRate} onChange={(e) => setRates({ ...rates, waterRate: e.target.value })} />
                    </label>
                    <label className="text-sm text-muted">ค่าไฟ <span className="block sm:inline text-xs">(บาท/หน่วย)</span>
                        <input type="number" min="0" step="any" className={rateInput} value={rates.elecRate} onChange={(e) => setRates({ ...rates, elecRate: e.target.value })} />
                    </label>
                    <label className="text-sm text-muted">ส่วนกลาง <span className="block sm:inline text-xs">(บาท)</span>
                        <input type="number" min="0" step="any" className={rateInput} value={rates.commonFee} onChange={(e) => setRates({ ...rates, commonFee: e.target.value })} />
                    </label>
                </div>
                {rateError && <p className="md:col-span-2 text-sm text-red-600">{rateError}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted max-w-3xl">
                    กรอกเลขมิเตอร์ปัจจุบันของห้องที่ต้องการออกใบ (มิเตอร์ก่อนหน้าดึงจากใบเดือนล่าสุดให้ แก้ได้ถ้าเปลี่ยนมิเตอร์) กด Enter เพื่อไปห้องถัดไป ห้องที่ไม่กรอกจะถูกข้าม
                </p>
                {/* ช่องค้นหา (ยืดเต็มที่เหลือบนจอเล็ก) และสวิตช์แสดงห้องที่มีใบแล้ว อยู่แถวเดียวกัน */}
                <div className="w-full sm:w-auto flex items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0 sm:flex-none sm:w-56 flex items-center gap-2 border border-line bg-white rounded-xl px-3 py-1.5 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/15">
                        <Icon name="search" className="w-4 h-4 text-muted shrink-0" />
                        <input type="text" placeholder="ค้นหาห้อง/ชื่อ" aria-label="ค้นหาห้องหรือชื่อผู้เช่า" className="outline-none w-full min-w-0 bg-transparent text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    {createdAlready > 0 && (
                        <span className="shrink-0">
                            <Switch checked={showCreated} onChange={setShowCreated} badge={createdAlready}>
                                แสดงห้องที่มีใบแล้ว
                            </Switch>
                        </span>
                    )}
                </div>
            </div>

            {rows.length === 0 ? (
                <p className="text-center py-10 text-muted">ยังไม่มีผู้เช่า</p>
            ) : shownRows.length === 0 ? (
                <p className="text-center py-10 text-muted">
                    {keyword ? 'ไม่พบห้องที่ตรงกับคำค้นหา' : `ทุกห้องมีใบแจ้งหนี้เดือน ${formatMonth(month)} แล้ว (เลือกเดือนอื่น หรือกดแสดงห้องที่มีใบแล้ว)`}
                </p>
            ) : (
                <>
                {/* จอเล็ก: การ์ดห้องละใบ (ไม่ต้องเลื่อนซ้าย-ขวา) แถวน้ำ/ไฟ = มิเตอร์ก่อนหน้า ปัจจุบัน และหน่วย */}
                <ul className="md:hidden flex flex-col gap-2">
                    {shownRows.map((r) => {
                        const input = inputs[r.room] ?? {}
                        const ev = evaluateRow(r, input, rates)
                        const disabled = ev.state === 'skip'
                        const rowError = summary.errors[r.room]
                        const meters = [
                            { col: 'water', label: 'น้ำ', prevKey: 'waterPrev', currKey: 'waterCurr', prev: r.waterPrev, units: ev.state === 'ready' ? ev.calc.waterUnits : unitsOf(input.waterCurr, input.waterPrev ?? r.waterPrev) },
                            { col: 'elec', label: 'ไฟ', prevKey: 'elecPrev', currKey: 'elecCurr', prev: r.elecPrev, units: ev.state === 'ready' ? ev.calc.elecUnits : unitsOf(input.elecCurr, input.elecPrev ?? r.elecPrev) },
                        ]
                        return (
                            <li key={r.room} className={`rounded-2xl border p-3 shadow-card ${disabled ? 'bg-slate-50 border-line text-muted' : rowError ? 'bg-red-50/60 border-red-200' : ev.state === 'ready' ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-line'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-medium text-ink truncate">{r.room} <span className="font-normal text-muted">· {r.name}</span></div>
                                        <div className="text-xs text-muted">ค่าเช่า {baht(r.rent)}</div>
                                    </div>
                                    {ev.state === 'ready' && <div className="shrink-0 text-right font-semibold tabular-nums text-primary-dark">{baht(ev.calc.total)}</div>}
                                </div>
                                {disabled && <div className="mt-1 text-xs">{ev.reason}</div>}
                                {rowError && <div className="mt-1 text-xs text-red-600">{rowError}</div>}
                                {!disabled && (
                                    // ช่องปัจจุบัน (ต้องกรอก) เด่นและกว้างกว่า ช่องก่อนหน้า (ดึงให้แล้ว แก้ได้) เรียบและแคบ
                                    <div className="mt-2.5 grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_4rem] items-center gap-x-2 gap-y-1.5">
                                        <span />
                                        <span className="text-xs text-muted text-center">ก่อนหน้า</span>
                                        <span className="text-xs text-muted text-center">ปัจจุบัน</span>
                                        <span />
                                        {meters.map((m) => (
                                            <div key={m.col} className="contents">
                                                <span className="text-sm font-medium text-ink">{m.label}</span>
                                                <input aria-label={`ห้อง ${r.room} มิเตอร์${m.label}ก่อนหน้า`} className="h-9 w-full min-w-0 border border-transparent bg-sand/70 rounded-lg px-2 text-right tabular-nums text-muted outline-none focus:border-secondary focus:bg-white" inputMode="numeric"
                                                    value={input[m.prevKey] ?? String(m.prev)} onChange={(e) => setCell(r.room, m.prevKey, e.target.value)} />
                                                <input aria-label={`ห้อง ${r.room} มิเตอร์${m.label}ปัจจุบัน`} className="h-9 w-full min-w-0 border border-line bg-white rounded-lg px-2.5 text-right tabular-nums text-ink outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20" inputMode="numeric" data-bulk-col={m.col}
                                                    value={input[m.currKey] ?? ''} onChange={(e) => setCell(r.room, m.currKey, e.target.value)} onKeyDown={(e) => onEnter(e, m.col)} />
                                                <span className="text-right text-sm tabular-nums text-muted whitespace-nowrap">{m.units === '' ? '-' : `${m.units} หน่วย`}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
                <div className="hidden md:block bg-white rounded-2xl shadow-card overflow-x-auto">
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
                            {shownRows.map((r) => {
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
                </>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            {/* แถบสรุปและปุ่มสร้าง (ต้องกดยืนยันอีกครั้ง เพราะผู้เช่าทุกคนจะได้รับแจ้งเตือนใบแจ้งหนี้ใหม่ทันที) */}
            <div data-bottom-bar className="sticky bottom-4 px-4 sm:px-5 py-3 bg-white rounded-2xl border border-line shadow-card flex flex-wrap items-center justify-between gap-3">
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
