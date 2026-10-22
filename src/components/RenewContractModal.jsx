import { useMemo, useState } from 'react'
import DatePicker from './DatePicker'
import { isAlreadyPast, monthsAdded, renewalOptions, renewContract, validateRenewal } from '../lib/contracts'
import { formatDate } from '../lib/tenants'

// หน้าต่างต่อสัญญาเช่า (แอดมิน): เลือกต่อ 6 เดือน / 1 ปี หรือกำหนดวันสิ้นสุดใหม่เอง ใส่หมายเหตุได้ ต่ออย่างเดียว เงินประกันใช้ก้อนเดิม
// currentEnd = วันสิ้นสุดสัญญาปัจจุบัน (YYYY-MM-DD) onRenewed(newEnd) เรียกหลังต่อสำเร็จ
function RenewContractModal({ room, tenantName, currentEnd, onClose, onRenewed }) {
    const options = useMemo(() => renewalOptions(currentEnd), [currentEnd])
    // ตัวเลือกที่เลือกอยู่: key ของตัวเลือกเร็ว หรือ 'custom'
    const [choice, setChoice] = useState(options[1].key)
    const [customDate, setCustomDate] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const newEnd = choice === 'custom' ? customDate : (options.find((o) => o.key === choice)?.date ?? '')
    const problem = newEnd ? validateRenewal(currentEnd, newEnd) : ''
    const added = newEnd && !problem ? monthsAdded(currentEnd, newEnd) : null

    const submit = async (e) => {
        e.preventDefault()
        const invalid = validateRenewal(currentEnd, newEnd)
        if (invalid) return setError(invalid)
        setSaving(true)
        setError('')
        const err = await renewContract(room, newEnd, note)
        setSaving(false)
        if (err) return setError(err)
        await onRenewed(newEnd)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="ต่อสัญญา" className="bg-white rounded-2xl p-6 shadow-xl w-[460px] max-w-full max-h-[95vh] overflow-y-auto flex flex-col gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-primary-dark">ต่อสัญญา ห้อง {room}</h2>
                    <p className="text-sm text-muted">{tenantName} · สัญญาปัจจุบันสิ้นสุด {formatDate(currentEnd)}</p>
                </div>

                <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm text-muted mb-1">ต่อสัญญา</legend>
                    <div className="grid grid-cols-3 gap-2">
                        {options.map((o) => (
                            <button
                                key={o.key}
                                type="button"
                                aria-pressed={choice === o.key}
                                onClick={() => { setChoice(o.key); setError('') }}
                                className={`rounded-xl border px-3 py-2.5 text-sm text-left ${choice === o.key ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary-dark' : 'border-line bg-white text-ink hover:bg-sand/60'}`}
                            >
                                <span className="block font-medium">{o.label}</span>
                                <span className="block text-xs text-muted">ถึง {formatDate(o.date)}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            aria-pressed={choice === 'custom'}
                            onClick={() => { setChoice('custom'); setError('') }}
                            className={`rounded-xl border px-3 py-2.5 text-sm text-left ${choice === 'custom' ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary-dark' : 'border-line bg-white text-ink hover:bg-sand/60'}`}
                        >
                            <span className="block font-medium">กำหนดเอง</span>
                            <span className="block text-xs text-muted">เลือกวันที่</span>
                        </button>
                    </div>
                    {choice === 'custom' && (
                        <div className="text-sm text-muted">
                            วันสิ้นสุดสัญญาใหม่
                            <DatePicker value={customDate} onChange={(v) => { setCustomDate(v); setError('') }} min={currentEnd} />
                        </div>
                    )}
                </fieldset>

                {/* สรุปผลก่อนยืนยัน */}
                {newEnd && !problem && (
                    <div className="rounded-xl bg-sand/70 border border-line px-4 py-3 text-sm">
                        <div className="text-muted">วันสิ้นสุดสัญญาใหม่</div>
                        <div className="font-semibold text-primary-dark">
                            {formatDate(newEnd)}
                            {added > 0 && <span className="ml-2 font-normal text-muted">(เพิ่ม {added} เดือน)</span>}
                        </div>
                        {isAlreadyPast(newEnd) && <p className="mt-1 text-amber-800">วันที่นี้ผ่านมาแล้ว สัญญาจะยังแสดงว่าหมดอายุ</p>}
                    </div>
                )}
                {newEnd && problem && <p className="text-sm text-red-600">{problem}</p>}

                <label className="text-sm text-muted">
                    หมายเหตุ (ไม่บังคับ)
                    <textarea
                        rows="2"
                        maxLength={500}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="เช่น ผู้เช่าขอต่อสัญญา ปรับค่าเช่าตามที่ตกลง"
                        className="w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white"
                    />
                </label>

                <p className="text-xs text-muted">
                    ต่อสัญญาอย่างเดียว: วันเริ่มสัญญา ค่าเช่า และเงินประกันไม่เปลี่ยน (ใช้เงินประกันก้อนเดิม) ผู้เช่าจะได้รับแจ้งเตือนในเว็บ และบันทึกไว้ในประวัติการแก้ไข
                </p>

                {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={saving} className="border border-line text-muted hover:bg-sand px-4 py-2 rounded-xl">ยกเลิก</button>
                    <button type="submit" disabled={saving || !newEnd || Boolean(problem)} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-5 py-2 rounded-xl shadow-card">
                        {saving ? 'กำลังต่อสัญญา...' : 'ยืนยันต่อสัญญา'}
                    </button>
                </div>
            </form>
        </div>
    )
}

export default RenewContractModal
