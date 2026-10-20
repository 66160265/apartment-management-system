import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { formatPromptPayId, generatePromptPayQR, isValidPromptPayId } from '../lib/promptpay'
import { loadSettings, saveSettings } from '../lib/useSettings'

// คลาส Tailwind ของช่องกรอกในหน้าตั้งค่า
const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2.5 mt-1 outline-none focus:border-secondary focus:bg-white focus:ring-4 focus:ring-secondary/15'

// กล่องหัวข้อในหน้าตั้งค่า: ไอคอน ชื่อหัวข้อ คำอธิบาย และเนื้อหา
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

// ช่องกรอกพร้อมหัวข้อและคำแนะนำใต้ช่อง
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

    // สร้าง QR ทดสอบ (ยอด 1 บาท) ใหม่ทุกครั้งที่รหัสพร้อมเพย์เปลี่ยน
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

// หน้าตั้งค่าหอพัก: ข้อมูลหอพัก บัญชีรับชำระ/พร้อมเพย์ วันครบกำหนด และอัตราค่าบริการ
function SettingsPage() {
    // ค่าในฟอร์ม (null = ยังโหลดไม่เสร็จ), error ตอนโหลด/บันทึก, สถานะบันทึกแล้ว/กำลังบันทึก
    const [form, setForm] = useState(null)
    const [loadError, setLoadError] = useState('')
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)

    // โหลดค่าตั้งค่าล่าสุดจากฐานข้อมูลมาใส่ฟอร์ม
    useEffect(() => {
        let active = true
        loadSettings(true)
            .then((s) => active && setForm({ ...s }))
            .catch((e) => active && setLoadError(`โหลดการตั้งค่าไม่สำเร็จ: ${e.message}`))
        return () => {
            active = false
        }
    }, [])

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key และล้างข้อความ error/บันทึกแล้ว
    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
        setSaved(false)
    }

    // ตรวจข้อมูล (ชื่อหอพัก รหัสพร้อมเพย์ ฯลฯ) แล้วบันทึกการตั้งค่า
    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.apartmentName.trim()) return setError('กรุณากรอกชื่อหอพัก')
        if (!isValidPromptPayId(form.promptpayId)) {
            return setError('รหัสพร้อมเพย์ไม่ถูกต้อง ต้องเป็นเบอร์มือถือ 10 หลัก (ขึ้นต้นด้วย 0) หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก')
        }
        // วันครบกำหนดต้องอยู่ระหว่าง 1–28 (ทุกเดือนมีวันนั้น) และอัตราค่าบริการต้องเป็นตัวเลขไม่ติดลบ
        const dueDay = Number(form.dueDay)
        if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return setError('วันครบกำหนดชำระต้องเป็นวันที่ 1 – 28')
        for (const [key, label] of [['rateWater', 'ค่าน้ำ'], ['rateElectric', 'ค่าไฟ'], ['commonFee', 'ค่าส่วนกลาง'], ['lateFeePerDay', 'ค่าปรับต่อวัน']]) {
            const n = Number(form[key])
            if (form[key] === '' || Number.isNaN(n) || n < 0) return setError(`${label}ต้องเป็นตัวเลขที่ไม่ติดลบ`)
        }
        const grace = Number(form.lateFeeGraceDays)
        if (form.lateFeeGraceDays === '' || !Number.isInteger(grace) || grace < 0 || grace > 60) return setError('วันผ่อนผันต้องเป็นจำนวนเต็ม 0 – 60 วัน')
        if (form.lateFeeCap !== '' && (Number.isNaN(Number(form.lateFeeCap)) || Number(form.lateFeeCap) < 0)) return setError('เพดานค่าปรับต้องเป็นตัวเลขที่ไม่ติดลบ (เว้นว่าง = ไม่จำกัด)')

        // บันทึก โดยจัดรูปแบบรหัสพร้อมเพย์ให้มีขีดคั่นก่อน
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

            {/* โหลดไม่สำเร็จ / กำลังโหลด / ฟอร์มตั้งค่า */}
            {loadError ? (
                <p className="px-6 text-red-600">{loadError}</p>
            ) : !form ? (
                <p className="px-6 text-muted">กำลังโหลด...</p>
            ) : (
                <form onSubmit={handleSubmit} className="px-4 sm:px-6 pb-28 flex flex-col gap-6 max-w-5xl">
                    {/* ส่วนที่ 1: ข้อมูลหอพัก */}
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

                    {/* ส่วนที่ 2: บัญชีธนาคารและพร้อมเพย์ + QR ทดสอบ (ช่องพร้อมเพย์ขอบแดงเมื่อรูปแบบไม่ถูก) */}
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

                    {/* ส่วนที่ 3: วันครบกำหนดและอัตราค่าบริการเริ่มต้น */}
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

                    {/* ส่วนที่ 3.5: ค่าปรับชำระล่าช้า */}
                    <Section icon="clock" title="ค่าปรับชำระล่าช้า" hint="คิดเป็นรายวันนับจากวันครบกำหนดชำระ ใช้กับใบแจ้งหนี้ที่ออกหลังจากตั้งค่านี้ ใบเดิมไม่เปลี่ยน">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="ค่าปรับ (บาท/วัน)" hint="0 = ไม่คิดค่าปรับ">
                                <input type="number" min="0" step="any" className={inputClass} value={form.lateFeePerDay} onChange={set('lateFeePerDay')} />
                            </Field>
                            <Field label="วันผ่อนผัน" hint="เกินกำหนดกี่วันแรกที่ยังไม่ปรับ">
                                <input type="number" min="0" max="60" step="1" className={inputClass} value={form.lateFeeGraceDays} onChange={set('lateFeeGraceDays')} />
                            </Field>
                            <Field label="เพดานค่าปรับสูงสุด (บาท)" hint="เว้นว่าง = ไม่จำกัด">
                                <input type="number" min="0" step="any" className={inputClass} value={form.lateFeeCap} onChange={set('lateFeeCap')} placeholder="ไม่จำกัด" />
                            </Field>
                        </div>
                        {Number(form.lateFeePerDay) > 0 && (
                            <p className="text-xs text-muted mt-3">
                                ตัวอย่าง: ครบกำหนดวันที่ {Number(form.dueDay) || 5} เกินกำหนด 10 วัน
                                {Number(form.lateFeeGraceDays) > 0 ? ` (ผ่อนผัน ${Number(form.lateFeeGraceDays)} วัน)` : ''} ค่าปรับ ={' '}
                                {(() => {
                                    const days = Math.max(0, 10 - (Number(form.lateFeeGraceDays) || 0))
                                    const fee = Number(form.lateFeePerDay) * days
                                    const capped = form.lateFeeCap !== '' ? Math.min(fee, Number(form.lateFeeCap)) : fee
                                    return `฿${capped.toLocaleString('th-TH')}`
                                })()}
                                . ค่าปรับรวมอยู่ในยอดที่ผู้เช่าต้องโอน (และใน QR) และเพิ่มขึ้นทุกวันจนกว่าจะชำระ คิดถึงวันที่ผู้เช่าโอน ไม่ใช่วันที่แอดมินตรวจสลิป กรุณาตรวจว่าตรงกับสัญญาเช่าของหอพัก
                            </p>
                        )}
                    </Section>

                    {/* ส่วนที่ 4: ตรวจสลิปอัตโนมัติ (EasySlip) */}
                    <Section icon="review" title="ตรวจสลิปอัตโนมัติ" hint="ช่วยอ่านยอดและเตือนข้อสังเกตจากสลิปที่ผู้เช่าแนบ แอดมินยังเป็นผู้กดยืนยันรับเงินเอง">
                        <Field label="โหมด">
                            <select className={inputClass} value={form.slipVerifyMode} onChange={set('slipVerifyMode')}>
                                <option value="off">ปิด (แอดมินตรวจสลิปด้วยตา)</option>
                                <option value="suggest">แนะนำ (ตรวจกับ EasySlip แล้วแสดงผลให้แอดมินดู)</option>
                                <option value="auto">อัตโนมัติ (ผ่านครบทุกเงื่อนไขแล้วยืนยันรับเงินให้เลย)</option>
                            </select>
                        </Field>
                        {form.slipVerifyMode === 'auto' && (
                            <p className="text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-2.5 mt-3">
                                ระบบจะยืนยันรับเงินให้เองเฉพาะสลิปที่ผ่านครบทุกข้อ: ยอดเท่ากับยอดคงเหลือพอดี, EasySlip ยืนยันว่าผู้รับคือบัญชีของหอพัก, มีเลขอ้างอิงและไม่เคยถูกใช้ ส่วนโอนไม่ครบ โอนเกิน หรือมีข้อสงสัย จะรอแอดมินตรวจเหมือนเดิม
                                <strong className="block mt-1">ต้องลงทะเบียนบัญชีรับเงินของหอพักในแดชบอร์ด EasySlip ก่อน ไม่งั้นจะไม่มีสลิปไหนอนุมัติอัตโนมัติได้</strong>
                            </p>
                        )}
                        <p className="text-xs text-muted mt-3">
                            โหมด &quot;แนะนำ&quot; ใช้โควตาของบริการ EasySlip ทุกครั้งที่ผู้เช่าส่งสลิป (สูงสุด 3 ครั้งต่อใบแจ้งหนี้) ต้องตั้งค่า API key เป็น secret ของ Edge Function verify-slip ก่อน ถ้ายังไม่ได้ตั้ง ระบบจะแสดงว่า &quot;ตรวจอัตโนมัติไม่สำเร็จ&quot; และให้ตรวจด้วยตา
                        </p>
                    </Section>

                    {/* แถบด้านล่าง: ข้อความ error/บันทึกแล้ว + ปุ่มบันทึก */}
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
