import Icon from './Icon'
import { AdminRepairPayment } from './RepairPayment'
import { RepairImage, RepairImagePicker, RepairStatusBadge } from './RepairParts'
import RepairTenantPanel from './RepairTenantPanel'
import { repairCategories, repairStatuses, repairStatusKeys } from '../data/repairs'
import { formatDateTime } from '../lib/billing'
import { formatTimeDate, lockedSlotsOf } from '../lib/adminRepairs'
import { formatSlot } from '../lib/repairs'

// คลาส Tailwind ของช่องกรอก/ตัวเลือกในฟอร์ม (ใช้ร่วมกันทุกช่อง)
const inputClass = 'w-full border border-line rounded-xl px-4 py-2 text-ink text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 bg-white disabled:bg-sand/60 disabled:text-muted'

// ฟอร์มเพิ่ม/จัดการรายการแจ้งซ่อมของแอดมิน (ส่วนที่ AdminRepairs แสดงเมื่อกำลังเพิ่มหรือแก้ไข)
// editing = 'new' หรือรายการที่กำลังแก้ไข, form/setForm = ค่าที่กำลังกรอก
// file/removeExisting = รูปใหม่ที่เลือก / กดนำรูปเดิมออก, askNewTime = กด "ให้ผู้เช่าเลือกเวลาใหม่"
// slotChoices = ช่วงเวลาที่ผู้เช่าสะดวกและยังไม่ผ่านไป, otherAppointments = นัดของห้องอื่น
function AdminRepairForm({
    editing, form, setForm, saving, formError,
    rooms, tenantOf, slotChoices, otherAppointments,
    askNewTime, setAskNewTime, file, setFile, removeExisting, setRemoveExisting,
    onSubmit, onDelete, onClose,
}) {
    // ค่าที่ใช้ตอนแสดงผล: เป็นรายการใหม่ไหม, รูปเดิมที่ยังแสดงในฟอร์ม
    const isNew = editing === 'new'
    const existingPath = !isNew && !removeExisting ? editing.image_path : null
    // เสร็จสิ้นแล้ว = ดูได้อย่างเดียว แก้อะไรไม่ได้อีก (ฐานข้อมูลล็อกไว้ด้วย)
    const locked = !isNew && editing.status === 'done'
    const fieldLocked = saving || locked
    // มีผู้เช่าเป็นเจ้าของเรื่องไหม (แอดมินแจ้งเองสำหรับห้องว่าง = ไม่มี) ใช้ซ่อนส่วนที่เกี่ยวกับผู้เช่า
    const hasTenant = !isNew && Boolean(editing.user_id)
    // ผู้เช่าส่งช่วงเวลามา: ผู้ดูแลเลือกหนึ่งช่วงเป็นวันนัด (เลือกได้เฉพาะตอนรอดำเนินการ บันทึกเป็นกำลังดำเนินการแล้วเปลี่ยนวันนัดไม่ได้)
    const canPickSlot = hasTenant && editing.status === 'pending' && !askNewTime && slotChoices.length > 0
    // บันทึกเป็นกำลังดำเนินการแล้ว: วันนัดล็อก และเปลี่ยนกลับเป็นรอดำเนินการไม่ได้
    const startedWork = !isNew && editing.status === 'in_progress'
    // กำลังดำเนินการหรือเสร็จสิ้น: ช่วงที่ผู้เช่าส่งมา พร้อมบอกว่าช่วงไหนเป็นวันนัด
    const lockedSlots = lockedSlotsOf(editing)
    // ยังไม่ได้เลือกวันนัด = เปลี่ยนเป็น "กำลังดำเนินการ" ไม่ได้
    const needSlot = canPickSlot && !form.appointment_date

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    // เปลี่ยนสถานะ (วันนัดผู้ดูแลเลือกเองจากช่วงที่ผู้เช่าส่งมา)
    const changeStatus = (status) => {
        setAskNewTime(false)
        setForm((f) => ({ ...f, status }))
    }

    return (
        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-card p-4 sm:p-6 md:p-8 max-w-3xl mx-auto border border-line flex flex-col gap-5">
            {/* หัวฟอร์ม: ชื่อฟอร์ม + ป้ายสถานะปัจจุบัน (เฉพาะตอนแก้ไข) */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-primary-dark">{isNew ? 'แจ้งซ่อมใหม่' : 'จัดการรายการแจ้งซ่อม'}</h2>
                {!isNew && <RepairStatusBadge status={editing.status} />}
            </div>
            {/* ซ่อมเสร็จแล้ว (แก้ไขไม่ได้): บอกผลการยืนยันของผู้เช่า (ห้องที่ไม่มีผู้เช่า = บอกแค่ว่าเสร็จแล้ว) */}
            {locked && (
                <p className={`-mt-2 text-sm rounded-xl px-4 py-2.5 flex items-center gap-2 ring-1 ${
                    !hasTenant || editing.tenant_confirmed_at ? 'text-emerald-800 bg-emerald-50 ring-emerald-200' : 'text-amber-900 bg-amber-50 ring-amber-200'
                }`}>
                    <Icon name={!hasTenant || editing.tenant_confirmed_at ? 'checkCircle' : 'clock'} className="w-4 h-4 shrink-0" />
                    {!hasTenant
                        ? 'เรื่องนี้ซ่อมเสร็จสิ้นแล้ว'
                        : editing.tenant_confirmed_at
                          ? `ผู้เช่ายืนยันว่าใช้งานได้ปกติเมื่อ ${formatDateTime(editing.tenant_confirmed_at)}`
                          : 'ซ่อมเสร็จแล้ว รอผู้เช่าตรวจสอบและยืนยันผลการซ่อม'}
                </p>
            )}

            {/* ผู้แจ้ง/วันที่แจ้ง และวันที่เสร็จสิ้น (อ่านอย่างเดียว) อยู่บนสุด แถวเดียวกันทุกขนาดจอ */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="min-w-0">
                    <label className="block text-sm text-muted mb-1">{isNew ? 'ผู้แจ้ง' : 'วันที่แจ้ง'}</label>
                    <input
                        disabled
                        value={isNew ? (form.room ? 'ผู้ดูแล' : '-') : formatTimeDate(editing.created_at)}
                        className={`${inputClass} min-w-0 px-3!`}
                    />
                </div>
                <div className="min-w-0">
                    <label className="block text-sm text-muted mb-1">วันที่เสร็จสิ้น</label>
                    <input disabled value={!isNew && editing.status === 'done' ? formatTimeDate(editing.completed_at) : '-'} className={`${inputClass} min-w-0 px-3!`} />
                </div>
            </div>

            {/* เลือกห้อง (แก้ได้เฉพาะรายการใหม่) และประเภท */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm text-muted mb-1">ห้อง</label>
                    <select value={form.room} onChange={set('room')} disabled={!isNew || saving} className={inputClass} required>
                        <option value="">เลือกห้อง</option>
                        {/* แจ้งซ่อมใหม่เลือกได้เฉพาะห้องว่าง (ห้องที่มีผู้เช่า ให้ผู้เช่าแจ้งเอง) */}
                        {rooms.map((n) => (
                            <option key={n} value={n} disabled={isNew && Boolean(tenantOf(n))}>
                                {n}{tenantOf(n) ? ` — ${tenantOf(n).name}` : ' (ว่าง)'}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm text-muted mb-1">ประเภท</label>
                    <select value={form.category} onChange={set('category')} disabled={fieldLocked} className={inputClass}>
                        {Object.entries(repairCategories).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ข้อมูลจากผู้เช่า: เวลาที่สะดวก เบอร์ติดต่อ และข้อความล่าสุด (แอดมินแจ้งเอง ไม่มีผู้เช่า = ไม่แสดง) */}
            {hasTenant && (
                <RepairTenantPanel
                    editing={editing}
                    form={form}
                    setForm={setForm}
                    saving={saving}
                    askNewTime={askNewTime}
                    setAskNewTime={setAskNewTime}
                    canPickSlot={canPickSlot}
                    lockedSlots={lockedSlots}
                    slotChoices={slotChoices}
                    needSlot={needSlot}
                    otherAppointments={otherAppointments}
                />
            )}

            {/* ชื่อปัญหา (บังคับกรอก) */}
            <div>
                <label className="block text-sm text-muted mb-1">ปัญหา{hasTenant && !locked && <span className="text-xs"> (ผู้เช่าเป็นผู้แจ้ง แก้ไขไม่ได้)</span>}</label>
                <input required maxLength={200} value={form.problem} onChange={set('problem')} disabled={fieldLocked || hasTenant} placeholder="เช่น หลอดไฟขาด" className={inputClass} />
            </div>

            {/* รายละเอียดเพิ่มเติม */}
            <div>
                <label className="block text-sm text-muted mb-1">รายละเอียดเพิ่มเติม</label>
                <textarea rows={3} maxLength={2000} value={form.detail} onChange={set('detail')} disabled={fieldLocked || hasTenant} placeholder="อธิบายอาการ ตำแหน่ง หรือช่วงเวลาที่สะดวกให้ช่างเข้า" className={inputClass} />
            </div>

            {/* เปลี่ยนสถานะงานซ่อม (ผู้เช่าจะได้รับแจ้งเตือนเมื่อสถานะเปลี่ยน) */}
            <div>
                <label className="block text-sm text-muted mb-1">สถานะ</label>
                <select value={form.status} onChange={(e) => changeStatus(e.target.value)} disabled={fieldLocked} className={inputClass}>
                    {/* เลือก "ยกเลิก" ไม่ได้ (ถ้ารายการอยู่ในสถานะนั้น ยังแสดงค่าปัจจุบันไว้แต่กดเลือกไม่ได้) */}
                    {repairStatusKeys.map((k) => {
                        const blocked = k === 'cancelled'
                        if (blocked && form.status !== k) return null
                        // ยังไม่ได้เลือกวันนัดจากช่วงที่ผู้เช่าส่งมา
                        const waitSlot = k === 'in_progress' && needSlot && form.status !== k
                        // กำลังดำเนินการแล้ว ย้อนกลับเป็นรอดำเนินการไม่ได้
                        const noBack = k === 'pending' && startedWork
                        return (
                            <option key={k} value={k} disabled={blocked || waitSlot || noBack} hidden={blocked}>
                                {repairStatuses[k].label}{waitSlot ? ' (เลือกวันเวลานัดก่อน)' : ''}
                            </option>
                        )
                    })}
                </select>
            </div>

            {/* ช่าง: บังคับกรอกตอนกำลังดำเนินการ (ผู้เช่าเห็นชื่อและเบอร์โทรช่าง) */}
            {(form.status === 'in_progress' || form.status === 'done') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm text-muted mb-1">ชื่อช่าง{form.status === 'in_progress' && <span className="text-red-600"> *</span>}</label>
                        <input maxLength={100} value={form.technician} onChange={set('technician')} disabled={fieldLocked} placeholder="เช่น ช่างสมชาย" className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm text-muted mb-1">เบอร์โทรช่าง{form.status === 'in_progress' && <span className="text-red-600"> *</span>}</label>
                        <input maxLength={20} inputMode="tel" value={form.technician_phone} onChange={set('technician_phone')} disabled={fieldLocked} placeholder="เช่น 081-234-5678" className={inputClass} />
                    </div>
                </div>
            )}

            {/* เสร็จสิ้น: ค่าใช้จ่าย และผู้รับผิดชอบค่าใช้จ่าย */}
            {form.status === 'done' && (
                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-muted mb-1">ค่าใช้จ่าย (บาท)</label>
                            <input type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} disabled={fieldLocked} placeholder="0" className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-sm text-muted mb-1">ผู้รับผิดชอบค่าใช้จ่าย</label>
                            {/* แอดมินแจ้งเอง (ไม่มีผู้เช่า): หอพักรับผิดชอบเสมอ แสดงเป็นช่องอ่านอย่างเดียว */}
                            {hasTenant ? (
                                <select value={form.cost_payer} onChange={set('cost_payer')} disabled={fieldLocked} className={inputClass}>
                                    <option value="owner">หอพัก (ของเสื่อมตามอายุการใช้งาน)</option>
                                    <option value="tenant">ผู้เช่า (ทำเสียหายเอง)</option>
                                </select>
                            ) : (
                                <input disabled value="หอพัก (ของเสื่อมตามอายุการใช้งาน)" className={inputClass} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ค่าซ่อมที่ผู้เช่าต้องชำระ: ตรวจสลิป ยืนยัน/ปฏิเสธ (มีสลิปรอตรวจหรือชำระแล้ว แก้ยอดค่าใช้จ่ายไม่ได้) */}
            {!isNew && <AdminRepairPayment repair={editing} />}

            {/* คำแนะนำเมื่อเลือกสถานะที่ล้างนัดเดิม */}
            {!isNew && editing.appointment_date && (form.status === 'pending' || form.status === 'cancelled') && editing.status === 'in_progress' && (
                <p className="-mt-2 text-xs text-muted">
                    นัดเดิม ({formatSlot(editing.appointment_date, editing.appointment_period)}) จะถูกยกเลิก
                    {form.status === 'pending' && ' ใช้กรณีช่างไปแล้วไม่พบผู้เช่า หรือต้องเลื่อนนัด'}
                </p>
            )}

            {/* ข้อความจากแอดมินถึงผู้เช่า (แอดมินแจ้งเองสำหรับห้องว่าง ไม่มีผู้เช่า จึงไม่แสดง) */}
            {hasTenant && (
                <div>
                    <label className="block text-sm text-muted mb-1">หมายเหตุถึงผู้เช่า (ผู้เช่าจะเห็นข้อความนี้)</label>
                    <textarea rows={2} maxLength={1000} value={form.admin_note} onChange={set('admin_note')} disabled={fieldLocked} placeholder={form.status === 'cancelled' ? 'เหตุผลที่ยกเลิก เช่น ซ่อมเรียบร้อยแล้วจากการแจ้งครั้งก่อน' : 'เช่น รออะไหล่ 2-3 วัน, ช่างจะโทรหาก่อนเข้า 30 นาที'} className={inputClass} />
                </div>
            )}

            {/* แนบ/เปลี่ยน/นำรูปออก (นำออกแล้วจะลบรูปเดิมตอนบันทึก) */}
            <div>
                <label className="block text-sm text-muted mb-1">รูปภาพ</label>
                {/* เรื่องที่ผู้เช่าแจ้ง หรือเสร็จสิ้นแล้ว: ดูรูปได้อย่างเดียว */}
                {locked || hasTenant ? (
                    editing.image_path ? (
                        <div className="rounded-2xl bg-sand/70 border border-line p-4 flex justify-center">
                            <RepairImage path={editing.image_path} className="max-h-72" />
                        </div>
                    ) : (
                        <p className="text-sm text-muted">ไม่มีรูปภาพ</p>
                    )
                ) : (
                    <RepairImagePicker
                        file={file}
                        existingPath={existingPath}
                        disabled={saving}
                        onPick={(f) => setFile(f)}
                        onClear={() => {
                            setFile(null)
                            setRemoveExisting(true)
                        }}
                    />
                )}
            </div>

            {/* ข้อความ error ของฟอร์ม */}
            {formError && <p className="text-sm text-red-600">{formError}</p>}

            {/* ปุ่มด้านล่าง: ลบ (เฉพาะตอนแก้ไข) ทางซ้าย, ยกเลิก/บันทึก ทางขวา */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t border-line">
                {!isNew ? (
                    <button type="button" disabled={saving} onClick={onDelete} className="border border-red-500 text-red-600 hover:bg-red-50 rounded-xl px-8 py-2.5 text-sm font-semibold w-full sm:w-auto">
                        ลบ
                    </button>
                ) : (
                    <div />
                )}
                <div className="flex gap-3 w-full sm:w-auto justify-end">
                    <button type="button" onClick={onClose} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-8 py-2.5 text-sm font-semibold flex-1 sm:flex-initial">
                        {locked ? 'ปิด' : 'ยกเลิก'}
                    </button>
                    {!locked && (
                        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-10 py-2.5 text-sm font-semibold shadow-card flex-1 sm:flex-initial">
                            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                    )}
                </div>
            </div>
        </form>
    )
}

export default AdminRepairForm
