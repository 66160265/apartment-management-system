import Icon from './Icon'
import { AppointmentBox, SlotPicker, TechnicianInfo } from './RepairParts'

// คลาส Tailwind ของช่องกรอก
const inputClass = 'w-full border border-line rounded-xl px-4 py-2 text-ink text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 bg-white disabled:bg-sand/60'

// ส่วนที่ผู้เช่าตอบกลับในหน้ารายละเอียดแจ้งซ่อม (ใช้ในฟอร์มของ pages/UserRepairsPage.jsx):
// วันนัดเข้าซ่อม (ยืนยัน/ขอเปลี่ยนเวลา), ช่างที่รับงาน, กล่องขอเปลี่ยนเวลา และการตรวจงานหลังซ่อม
// respond = { action, setAction, actionForm, setActionForm, accept, openAction, submitReschedule, confirmFixed, submitNotFixed }
function UserRepairResponses({ editing, saving, respond }) {
    const { action, setAction, actionForm, setActionForm, accept, openAction, submitReschedule, confirmFixed, submitNotFixed } = respond

    return (
        <>
            {/* วันนัดเข้าซ่อม: ผู้ดูแลเสนอมา = ยืนยัน/ขอเปลี่ยนเวลาได้, ยืนยันนัดแล้ว = เปลี่ยนเวลาไม่ได้ */}
            {editing.status === 'in_progress' && editing.appointment_date && (
                <AppointmentBox repair={editing}>
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-violet-900">
                        <Icon name="phone" className="w-4 h-4 mt-0.5 shrink-0" />
                        ช่างจะโทรไปคอนเฟิร์มกับคุณอีกครั้งก่อนถึงเวลานัด 30 นาที
                    </p>
                    {editing.appointment_state === 'proposed' && action !== 'reschedule' && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            <button type="button" onClick={accept} disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                                <Icon name="check" className="w-4 h-4" />
                                สะดวก ยืนยันนัดนี้
                            </button>
                            <button type="button" onClick={() => openAction('reschedule')} disabled={saving} className="border border-line bg-white hover:bg-sand rounded-xl px-4 py-2 text-sm font-semibold text-primary-dark">
                                ไม่สะดวก ขอเปลี่ยนเวลา
                            </button>
                        </div>
                    )}
                </AppointmentBox>
            )}
            {/* กำลังดำเนินการแต่ไม่มีวันนัด (เช่น อนุญาตให้ช่างเข้าห้องได้เลย): แสดงชื่อและเบอร์ช่าง */}
            {editing.status === 'in_progress' && !editing.appointment_date && editing.technician && (
                <div className="rounded-xl border-l-4 border-violet-400 bg-violet-50 px-4 py-3">
                    <div className="text-xs font-semibold text-violet-800">ช่างที่รับงาน</div>
                    <TechnicianInfo repair={editing} className="mt-1" />
                </div>
            )}

            {/* กล่องขอเปลี่ยนเวลา: เลือกช่วงที่สะดวกใหม่ + เหตุผล */}
            {action === 'reschedule' && (
                <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
                    <div className="font-medium text-primary-dark">เลือกช่วงเวลาที่สะดวกใหม่</div>
                    <SlotPicker slots={actionForm.slots} onChange={(slots) => setActionForm((f) => ({ ...f, slots }))} disabled={saving} />
                    <label className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" checked={actionForm.allow_entry} onChange={(e) => setActionForm((f) => ({ ...f, allow_entry: e.target.checked }))} disabled={saving} />
                        อนุญาตให้ช่างเข้าห้องได้แม้ฉันไม่อยู่
                    </label>
                    <textarea rows={2} maxLength={500} value={actionForm.note} onChange={(e) => setActionForm((f) => ({ ...f, note: e.target.value }))} disabled={saving} placeholder="เหตุผล เช่น ติดธุระต่างจังหวัด" className={inputClass} />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAction(null)} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-4 py-2 text-sm">ยกเลิก</button>
                        <button type="button" onClick={submitReschedule} disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-4 py-2 text-sm font-semibold">
                            {saving ? 'กำลังส่ง...' : 'ส่งคำขอเปลี่ยนเวลา'}
                        </button>
                    </div>
                </div>
            )}

            {/* ซ่อมเสร็จแล้ว: ให้ผู้เช่าตรวจและยืนยัน หรือแจ้งว่ายังไม่หาย */}
            {editing.status === 'done' && !editing.tenant_confirmed_at && (
                <div className="rounded-xl bg-emerald-50 border-l-4 border-emerald-400 px-4 py-3 flex flex-col gap-3">
                    <div>
                        <div className="text-sm font-semibold text-emerald-900">ช่างแจ้งว่าซ่อมเสร็จแล้ว</div>
                        <div className="text-sm text-emerald-900/80">กรุณาตรวจสอบว่าใช้งานได้ปกติหรือไม่</div>
                    </div>
                    {action === 'notFixed' ? (
                        <>
                            <textarea rows={2} maxLength={500} value={actionForm.note} onChange={(e) => setActionForm((f) => ({ ...f, note: e.target.value }))} disabled={saving} placeholder="อธิบายว่ายังมีปัญหาอะไร เช่น ก๊อกยังมีน้ำซึม" className={inputClass} />
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setAction(null)} disabled={saving} className="border border-line bg-white text-muted hover:bg-sand rounded-xl px-4 py-2 text-sm">ยกเลิก</button>
                                <button type="button" onClick={submitNotFixed} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-semibold">
                                    {saving ? 'กำลังส่ง...' : 'แจ้งซ่อมอีกครั้ง'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={confirmFixed} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                                <Icon name="check" className="w-4 h-4" />
                                ใช้งานได้ปกติแล้ว
                            </button>
                            <button type="button" onClick={() => openAction('notFixed')} disabled={saving} className="border border-red-300 bg-white text-red-600 hover:bg-red-50 rounded-xl px-4 py-2 text-sm font-semibold">
                                ยังไม่หาย
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

export default UserRepairResponses
