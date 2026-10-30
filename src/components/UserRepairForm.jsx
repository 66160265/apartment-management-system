import Icon from './Icon'
import RepairProgress from './RepairProgress'
import { TenantRepairPayment } from './RepairPayment'
import { RepairImage, RepairImagePicker, RepairStatusBadge, SlotList, SlotPicker } from './RepairParts'
import UserRepairResponses from './UserRepairResponses'
import { repairCategories } from '../data/repairs'
import { baht, formatDateTime } from '../lib/billing'

// คลาส Tailwind ของช่องกรอก
const inputClass = 'w-full border border-line rounded-xl px-4 py-2 text-ink text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 bg-white disabled:bg-sand/60'

// ฟอร์มแจ้งซ่อม/ดูรายละเอียดของผู้เช่า (ส่วนที่ pages/UserRepairsPage.jsx แสดงเมื่อกำลังเพิ่มหรือเปิดดูรายการ)
// editing = 'new' หรือรายการที่เปิดอยู่ (ผู้ดูแลรับเรื่องแล้วจะเป็นหน้าดูอย่างเดียว)
// respond = ฟังก์ชันตอบกลับผู้ดูแล (ดู UserRepairResponses), onRequestCancel = เปิดหน้าต่างยืนยันยกเลิกการแจ้ง
function UserRepairForm({
    editing, room, userId, form, setForm, saving, formError,
    file, setFile, removeExisting, setRemoveExisting,
    respond, onSubmit, onClose, onRequestCancel,
}) {
    const isNew = editing === 'new'
    // รายการที่ผู้ดูแลรับเรื่องแล้วจะแก้ไขไม่ได้ แสดงเป็นหน้าดูรายละเอียดอย่างเดียว
    const readOnly = !isNew && editing.status !== 'pending'
    const existingPath = !isNew && !removeExisting ? editing.image_path : null

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    return (
        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-card p-4 sm:p-6 md:p-8 max-w-2xl w-full mx-auto border border-line flex flex-col gap-5">
            {/* ปุ่มกลับ หัวข้อ (ใหม่/แก้ไข/ดูอย่างเดียว) และป้ายสถานะ */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button type="button" onClick={onClose} disabled={saving} aria-label="กลับ" className="text-muted hover:text-primary-dark">
                    <Icon name="arrowLeft" />
                </button>
                <h2 className="text-lg font-semibold text-primary-dark">{isNew ? 'แจ้งซ่อมใหม่' : readOnly ? 'รายละเอียดการแจ้งซ่อม' : 'แก้ไขเรื่องแจ้งซ่อม'}</h2>
                {!isNew && <div className="ml-auto"><RepairStatusBadge status={editing.status} /></div>}
            </div>

            {/* รายการเดิม: แถบความคืบหน้าและวันที่แจ้ง */}
            {!isNew && (
                <div className="rounded-xl bg-sand/60 border border-line px-4 py-4">
                    <RepairProgress status={editing.status} />
                    <p className="text-xs text-muted text-center mt-3">
                        แจ้งเมื่อ {formatDateTime(editing.created_at)}
                        {editing.reopen_count > 0 && ` · แจ้งซ้ำ ${editing.reopen_count} ครั้ง`}
                    </p>
                </div>
            )}

            {/* วันนัด ช่าง ขอเปลี่ยนเวลา และตรวจงานหลังซ่อม */}
            {!isNew && <UserRepairResponses editing={editing} saving={saving} respond={respond} />}

            {/* ห้อง (อ่านอย่างเดียว) */}
            <div>
                <label className="block text-sm text-muted mb-1">ห้อง</label>
                <input disabled value={room} className={inputClass} />
            </div>

            {/* ประเภทงานซ่อม (บังคับเลือก) */}
            <div>
                <label className="block text-sm text-muted mb-1">ประเภท <span className="text-red-500">*</span></label>
                <select value={form.category} onChange={set('category')} disabled={saving || readOnly} className={inputClass}>
                    <option value="" disabled>-- เลือกประเภท --</option>
                    {Object.entries(repairCategories).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                    ))}
                </select>
            </div>

            {/* ปัญหาที่พบ (บังคับกรอก) */}
            <div>
                <label className="block text-sm text-muted mb-1">ปัญหาที่พบ <span className="text-red-500">*</span></label>
                <input required maxLength={200} value={form.problem} onChange={set('problem')} disabled={saving || readOnly} placeholder="เช่น หลอดไฟขาด, ก๊อกน้ำรั่ว" className={inputClass} />
            </div>

            {/* รายละเอียดเพิ่มเติม */}
            <div>
                <label className="block text-sm text-muted mb-1">รายละเอียดเพิ่มเติม</label>
                <textarea rows={4} maxLength={2000} value={form.detail} onChange={set('detail')} disabled={saving || readOnly} placeholder="อธิบายอาการและตำแหน่ง เช่น ก๊อกอ่างล้างหน้าในห้องน้ำมีน้ำหยดตลอด" className={inputClass} />
            </div>

            {/* วันเวลาที่สะดวกให้ช่างเข้า: แก้ได้เฉพาะตอนยังรอดำเนินการ, ดูอย่างเดียวแสดงเป็นรายการ (มีวันนัดแล้วไม่ต้องแสดง ดูที่กล่องนัดเข้าซ่อมแทน) */}
            {!(readOnly && editing.appointment_date) && (
                <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
                    <div>
                        <div className="text-sm font-medium text-primary-dark">วันเวลาที่สะดวกให้ช่างเข้าซ่อม</div>
                    </div>
                    {readOnly ? (
                        <SlotList slots={editing.available_slots} allowEntry={editing.allow_entry} />
                    ) : (
                        <>
                            <SlotPicker slots={form.slots} onChange={(slots) => setForm((f) => ({ ...f, slots }))} disabled={saving} />
                            <label className="flex items-start gap-2 text-sm text-ink">
                                <input type="checkbox" className="mt-1" checked={form.allow_entry} onChange={(e) => setForm((f) => ({ ...f, allow_entry: e.target.checked }))} disabled={saving} />
                                <span>
                                    อนุญาตให้ช่างเข้าห้องได้แม้ฉันไม่อยู่
                                    <span className="block text-xs text-muted">ผู้ดูแลจะใช้กุญแจสำรองเปิดห้องและแจ้งให้ทราบทุกครั้ง</span>
                                </span>
                            </label>
                        </>
                    )}
                </div>
            )}

            {/* รูปภาพ: ดูอย่างเดียวแสดงรูปเดิม ไม่งั้นใช้ตัวเลือกรูป */}
            <div>
                <label className="block text-sm text-muted mb-1">รูปภาพ (ถ้ามี)</label>
                {readOnly ? (
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
                        onPick={setFile}
                        onClear={() => {
                            setFile(null)
                            setRemoveExisting(true)
                        }}
                    />
                )}
            </div>

            {/* ข้อความจากผู้ดูแล */}
            {!isNew && editing.admin_note && (
                <div className="rounded-xl bg-mist/40 border-l-4 border-primary px-4 py-3">
                    <div className="text-xs font-semibold text-primary-dark mb-0.5">ข้อความจากผู้ดูแล</div>
                    <p className="text-sm text-ink whitespace-pre-line wrap-break-word">{editing.admin_note}</p>
                </div>
            )}

            {/* ข้อความล่าสุดของผู้เช่า (เหตุผลขอเปลี่ยนเวลา / ยังไม่หาย) */}
            {!isNew && editing.tenant_message && (
                <div className="rounded-xl bg-sand/60 border-l-4 border-secondary px-4 py-3">
                    <div className="text-xs font-semibold text-primary-dark mb-0.5">ข้อความล่าสุดของคุณ</div>
                    <p className="text-sm text-ink whitespace-pre-line wrap-break-word">{editing.tenant_message}</p>
                </div>
            )}
            {/* ค่าใช้จ่ายที่ผู้เช่าต้องชำระ (หอพักรับผิดชอบไม่ต้องแสดง) */}
            {!isNew && Number(editing.cost) > 0 && editing.cost_payer === 'tenant' && (
                <p className="text-sm text-ink">
                    ค่าใช้จ่าย <span className="font-semibold">{baht(editing.cost)}</span>{' '}
                    <span className="text-red-600">(ผู้เช่าเป็นผู้ชำระ)</span>
                </p>
            )}

            {/* ชำระค่าซ่อม (ซ่อมเสร็จและผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ) */}
            {!isNew && <TenantRepairPayment repair={editing} userId={userId} />}

            {/* ผู้เช่ายืนยันผลการซ่อมแล้ว */}
            {!isNew && editing.tenant_confirmed_at && (
                <p className="text-sm text-emerald-700">คุณยืนยันว่าใช้งานได้ปกติเมื่อ {formatDateTime(editing.tenant_confirmed_at)}</p>
            )}

            {/* เวลาที่ซ่อมเสร็จ */}
            {!isNew && editing.status === 'done' && editing.completed_at && (
                <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
                    <Icon name="checkCircle" className="w-4 h-4" />
                    ซ่อมเสร็จเมื่อ {formatDateTime(editing.completed_at)}
                </p>
            )}

            {/* ข้อความ error ของฟอร์ม */}
            {formError && <p className="text-sm text-red-600">{formError}</p>}

            {/* ปุ่มด้านล่าง: ยกเลิกการแจ้ง (เฉพาะรายการที่ยังรอ) | ปิด/ยกเลิก + ส่งเรื่อง/บันทึก */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t border-line">
                {!isNew && !readOnly ? (
                    <button type="button" onClick={onRequestCancel} disabled={saving} className="flex items-center justify-center gap-1.5 border border-red-500 text-red-600 hover:bg-red-50 px-6 py-2.5 rounded-xl text-sm font-semibold w-full sm:w-auto">
                        <Icon name="trash" className="w-4 h-4" />
                        ยกเลิกการแจ้ง
                    </button>
                ) : (
                    <span />
                )}
                <div className="flex gap-3 w-full sm:w-auto justify-end">
                    <button type="button" onClick={onClose} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-8 py-2.5 text-sm font-semibold flex-1 sm:flex-initial">
                        {readOnly ? 'ปิด' : 'ยกเลิก'}
                    </button>
                    {!readOnly && (
                        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-8 py-2.5 text-sm font-semibold shadow-card flex items-center justify-center gap-2 flex-1 sm:flex-initial">
                            <Icon name="send" className="w-4 h-4" />
                            {saving ? 'กำลังส่ง...' : isNew ? 'ส่งเรื่อง' : 'บันทึก'}
                        </button>
                    )}
                </div>
            </div>
        </form>
    )
}

export default UserRepairForm
