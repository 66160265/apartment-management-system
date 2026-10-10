import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { formatPromptPayId, generatePromptPayQR, isValidPromptPayId } from '../lib/promptpay'
import { loadSettings, saveSettings } from '../lib/useSettings'

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2.5 mt-1 outline-none focus:border-secondary focus:bg-white focus:ring-4 focus:ring-secondary/15'

function Section({ icon, title, hint, children }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-5">
            <div className="flex items-center gap-3 mb-4">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-mist/60 text-primary-dark">
                    <Icon name={icon} className="w-5 h-5" />
                </span>
                <div>
                    <h2 className="font-medium text-primary-dark">{title}</h2>
                    {hint && <p className="text-xs text-muted">{hint}</p>}
                </div>
            </div>
            {children}
        </section>
    )
}

function Field({ label, hint, children }) {
    return (
        <label className="text-sm text-muted block">
            {label}
            {children}
            {hint && <span className="block text-xs mt-1">{hint}</span>}
        </label>
    )
}

// QR ทดสอบ (ยอด 1 บาท) ให้ผู้ดูแลลองสแกนด้วยแอปธนาคารว่าชื่อบัญชีปลายทางถูกต้อง
function TestQr({ promptpayId }) {
    const [qr, setQr] = useState({ url: null, error: '' })

    useEffect(() => {
        let active = true
        generatePromptPayQR(promptpayId, 1, { width: 360 })
            .then((url) => active && setQr({ url, error: '' }))
            .catch((e) => active && setQr({ url: null, error: e.message }))
        return () => {
            active = false
        }
    }, [promptpayId])

    return (
        <div className="rounded-2xl border border-line bg-sand/50 p-4 flex flex-col items-center gap-2 text-center">
            <div className="text-sm font-medium text-primary-dark">QR ทดสอบ (ยอด ฿1.00)</div>
            {qr.url ? (
                <img src={qr.url} alt="QR พร้อมเพย์ทดสอบ" className="w-44 h-44 rounded-xl bg-white border border-line" />
            ) : (
                <div className="w-44 h-44 grid place-items-center rounded-xl bg-white border border-dashed border-line text-xs text-muted px-4">
                    {qr.error ? 'รหัสพร้อมเพย์ยังไม่ถูกต้อง' : 'กำลังสร้าง...'}
                </div>
            )}
            <p className="text-xs text-muted">สแกนด้วยแอปธนาคาร เพื่อตรวจว่าชื่อบัญชีปลายทางเป็นของหอพัก (ไม่ต้องโอนจริง)</p>
        </div>
    )
}

function SettingsPage() {
    const [form, setForm] = useState(null)
    const [loadError, setLoadError] = useState('')
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let active = true
        loadSettings(true)
            .then((s) => active && setForm({ ...s }))
            .catch((e) => active && setLoadError(`โหลดการตั้งค่าไม่สำเร็จ: ${e.message}`))
        return () => {
            active = false
        }
    }, [])

    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
        setSaved(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.apartmentName.trim()) return setError('กรุณากรอกชื่อหอพัก')
        if (!isValidPromptPayId(form.promptpayId)) {
            return setError('รหัสพร้อมเพย์ไม่ถูกต้อง ต้องเป็นเบอร์มือถือ 10 หลัก (ขึ้นต้นด้วย 0) หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก')
        }
        const dueDay = Number(form.dueDay)
        if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return setError('วันครบกำหนดชำระต้องเป็นวันที่ 1 – 28')
        for (const [key, label] of [['rateWater', 'ค่าน้ำ'], ['rateElectric', 'ค่าไฟ'], ['commonFee', 'ค่าส่วนกลาง']]) {
            const n = Number(form[key])
            if (form[key] === '' || Number.isNaN(n) || n < 0) return setError(`${label}ต้องเป็นตัวเลขที่ไม่ติดลบ`)
        }

        setSaving(true)
        const err = await saveSettings({
            ...form,
            promptpayId: formatPromptPayId(form.promptpayId),
            dueDay,
        })
        setSaving(false)
        if (err) return setError(err)
        setForm({ ...form, promptpayId: formatPromptPayId(form.promptpayId) })
        setSaved(true)
    }

    return (
        <>
            <PageHeader title="ตั้งค่าหอพัก" subtitle="ข้อมูลหอพัก บัญชีรับชำระเงิน และอัตราค่าบริการ ที่ใช้ในใบแจ้งหนี้และ QR พร้อมเพย์" />

            {loadError ? (
                <p className="px-6 text-red-600">{loadError}</p>
            ) : !form ? (
                <p className="px-6 text-muted">กำลังโหลด...</p>
            ) : (
                <form onSubmit={handleSubmit} className="px-4 sm:px-6 pb-28 flex flex-col gap-6 max-w-5xl">
                    <Section icon="building" title="ข้อมูลหอพัก" hint="แสดงที่หัวใบแจ้งหนี้ (PDF)">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="ชื่อหอพัก">
                                <input className={inputClass} value={form.apartmentName} onChange={set('apartmentName')} />
                            </Field>
                            <Field label="ชื่อภาษาอังกฤษ">
                                <input className={inputClass} value={form.apartmentNameEn} onChange={set('apartmentNameEn')} />
                            </Field>
                            <div className="sm:col-span-2">
                                <Field label="ที่อยู่">
                                    <textarea rows="2" className={inputClass} value={form.address} onChange={set('address')} />
                                </Field>
                            </div>
                            <Field label="เบอร์โทรศัพท์ติดต่อ">
                                <input className={inputClass} value={form.phone} onChange={set('phone')} inputMode="tel" />
                            </Field>
                            <Field label="อีเมล">
                                <input type="email" className={inputClass} value={form.email} onChange={set('email')} />
                            </Field>
                        </div>
                    </Section>

                    <Section icon="bank" title="บัญชีรับชำระเงิน" hint="ผู้เช่าเห็นข้อมูลนี้ในหน้าชำระเงินและในไฟล์ PDF">
                        <div className="grid gap-6 lg:grid-cols-[1fr_16rem] items-start">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="ธนาคาร">
                                    <input className={inputClass} value={form.bankName} onChange={set('bankName')} />
                                </Field>
                                <Field label="เลขที่บัญชี">
                                    <input className={inputClass} value={form.bankAccount} onChange={set('bankAccount')} inputMode="numeric" />
                                </Field>
                                <Field label="ชื่อบัญชี">
                                    <input className={inputClass} value={form.bankHolder} onChange={set('bankHolder')} />
                                </Field>
                                <Field
                                    label="รหัสพร้อมเพย์"
                                    hint="เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก ที่ผูกพร้อมเพย์ไว้"
                                >
                                    <input
                                        className={`${inputClass} ${form.promptpayId && !isValidPromptPayId(form.promptpayId) ? 'border-red-300' : ''}`}
                                        value={form.promptpayId}
                                        onChange={set('promptpayId')}
                                        inputMode="numeric"
                                    />
                                </Field>
                            </div>
                            <TestQr promptpayId={form.promptpayId} />
                        </div>
                    </Section>

                    <Section icon="receipt" title="ใบแจ้งหนี้" hint="ค่าเริ่มต้นตอนสร้างใบแจ้งหนี้ใหม่ (แก้เฉพาะใบได้ตอนสร้าง) ใบเดิมไม่เปลี่ยนตาม">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Field label="ครบกำหนดชำระ (วันที่ของเดือนถัดไป)">
                                <input type="number" min="1" max="28" className={inputClass} value={form.dueDay} onChange={set('dueDay')} />
                            </Field>
                            <Field label="ค่าน้ำ (บาท/หน่วย)">
                                <input type="number" min="0" step="any" className={inputClass} value={form.rateWater} onChange={set('rateWater')} />
                            </Field>
                            <Field label="ค่าไฟ (บาท/หน่วย)">
                                <input type="number" min="0" step="any" className={inputClass} value={form.rateElectric} onChange={set('rateElectric')} />
                            </Field>
                            <Field label="ค่าส่วนกลาง (บาท/เดือน)">
                                <input type="number" min="0" step="any" className={inputClass} value={form.commonFee} onChange={set('commonFee')} />
                            </Field>
                        </div>
                    </Section>

                    <div className="fixed bottom-0 right-0 left-0 lg:left-64 z-20 bg-white/90 backdrop-blur border-t border-line px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-h-6 text-sm">
                            {error && <span className="text-red-600">{error}</span>}
                            {saved && (
                                <span className="flex items-center gap-1.5 text-emerald-700">
                                    <Icon name="checkCircle" className="w-4 h-4" />
                                    บันทึกการตั้งค่าเรียบร้อยแล้ว
                                </span>
                            )}
                        </div>
                        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-2 rounded-xl shadow-card">
                            {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                        </button>
                    </div>
                </form>
            )}
        </>
    )
}

export default SettingsPage
