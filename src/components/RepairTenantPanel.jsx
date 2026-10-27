import Icon from './Icon'
import { SlotList } from './RepairParts'
import { countOverlaps, formatSlot, normalizePeriod } from '../lib/repairs'

// กล่องข้อมูลจากผู้เช่าในฟอร์มจัดการแจ้งซ่อมของแอดมิน: เวลาที่สะดวก เบอร์ติดต่อ และข้อความล่าสุด
// (แสดงเฉพาะเรื่องที่ผู้เช่าแจ้ง แอดมินแจ้งเองสำหรับห้องว่างไม่มีกล่องนี้)
// canPickSlot = เลือกวันนัดจากช่วงที่ผู้เช่าส่งมาได้, lockedSlots = ช่วงที่ล็อกแล้วพร้อมวันนัด, needSlot = ยังไม่ได้เลือกวันนัด
// otherAppointments = นัดของห้องอื่น ใช้บอกว่าช่วงที่เลือกมีงานอื่นทับกี่งาน
function RepairTenantPanel({ editing, form, setForm, saving, askNewTime, setAskNewTime, canPickSlot, lockedSlots, slotChoices, needSlot, otherAppointments }) {
    return (
        <div className="rounded-xl bg-sand/60 border border-line p-4 flex flex-col gap-3">
            <div className="text-sm font-medium text-primary-dark">เวลาที่ผู้เช่าสะดวกให้ช่างเข้า</div>
            {/* กำลังดำเนินการหรือเสร็จสิ้น: ช่วงที่เป็นวันนัดเด่นขึ้นมา ช่วงอื่นจางลง (เปลี่ยนวันนัดไม่ได้) */}
            {lockedSlots && (
                <div className="flex flex-col gap-1.5 text-sm">
                    {lockedSlots.map((s) => (
                        <div key={`${s.date}-${s.period}`} className={`flex items-center gap-2 ${s.chosen ? 'font-semibold text-primary-dark' : 'text-muted'}`}>
                            <Icon name={s.chosen ? 'checkCircle' : 'calendar'} className={`w-4 h-4 shrink-0 ${s.chosen ? 'text-primary' : 'text-muted'}`} />
                            <span>{formatSlot(s.date, s.period)}</span>
                            {s.chosen && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">วันนัด</span>}
                        </div>
                    ))}
                </div>
            )}
            {(!(canPickSlot || lockedSlots) || editing.allow_entry || editing.availability_note) && (
                <SlotList
                    slots={canPickSlot || lockedSlots ? [] : editing.available_slots}
                    allowEntry={editing.allow_entry}
                    note={editing.availability_note}
                />
            )}
            {/* เลือกวันนัดจากช่วงที่ผู้เช่าส่งมา (บอกจำนวนนัดของห้องอื่นที่ทับช่วงนั้น แต่ไม่ห้าม) */}
            {canPickSlot && (
                <div role="radiogroup" aria-label="ช่วงเวลานัดเข้าซ่อม" className="flex flex-col gap-1.5">
                    <div className={`text-xs font-medium ${needSlot ? 'text-amber-800' : 'text-muted'}`}>
                        {needSlot ? 'เลือกวันเวลานัด 1 ช่วง ก่อนเปลี่ยนเป็น "กำลังดำเนินการ"' : 'วันเวลานัด'}
                    </div>
                    {slotChoices.map((s) => {
                        const selected = form.appointment_date === s.date && form.appointment_period === s.period
                        const overlaps = countOverlaps(otherAppointments, s.date, s.period)
                        return (
                            <button
                                key={`${s.date}-${s.period}`}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setForm((f) => ({ ...f, appointment_date: s.date, appointment_period: s.period }))}
                                disabled={saving}
                                className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                                    selected ? 'border-primary bg-mist/50 text-primary-dark font-medium' : 'border-line bg-white text-ink hover:bg-mist/30'
                                }`}
                            >
                                <span className={`grid place-items-center w-4 h-4 rounded-full border-2 shrink-0 ${selected ? 'border-primary' : 'border-line'}`}>
                                    {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                                </span>
                                <span className="flex-1">{formatSlot(s.date, s.period)}</span>
                                {overlaps > 0 && <span className="text-xs font-normal text-amber-700">มีนัดห้องอื่นในช่วงนี้ {overlaps} งาน</span>}
                            </button>
                        )
                    })}
                </div>
            )}
            {/* ช่างไม่ว่างตามเวลาที่ผู้เช่าเลือก: กดแล้วบันทึก = ล้างเวลาเดิมและแจ้งเตือนให้ผู้เช่าเลือกเวลาใหม่ */}
            {(editing.available_slots?.length > 0 || editing.allow_entry) && editing.status === 'pending' &&
                (askNewTime ? (
                    <div className="self-start flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-900">
                        <Icon name="alert" className="w-4 h-4 shrink-0" />
                        <span>บันทึกแล้วจะแจ้งให้ผู้เช่าเลือกเวลาใหม่</span>
                        <button type="button" onClick={() => {
                                setAskNewTime(false)
                                setForm((f) => ({ ...f, status: editing.status, appointment_date: editing.appointment_date ?? '', appointment_period: normalizePeriod(editing.appointment_period) }))
                            }}
                            disabled={saving}
                            className="text-xs text-primary hover:underline"
                        >
                            ยกเลิก
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            setAskNewTime(true)
                            setForm((f) => ({ ...f, status: 'pending', appointment_date: '', appointment_period: '' }))
                        }}
                        disabled={saving}
                        className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white border border-line text-primary-dark hover:bg-mist/40"
                    >
                        <Icon name="calendar" className="w-4 h-4" />
                        ให้ผู้เช่าเลือกเวลาใหม่
                    </button>
                ))}
            {editing.contact_phone && (
                <a href={`tel:${editing.contact_phone}`} className="text-sm text-primary hover:underline flex items-center gap-1.5">
                    <Icon name="phone" className="w-4 h-4" />
                    โทรหาผู้เช่า {editing.contact_phone}
                </a>
            )}
            {editing.tenant_message && (
                <div className="rounded-lg bg-amber-50 border-l-4 border-amber-400 px-3 py-2 text-sm">
                    <div className="text-xs font-semibold text-amber-800">ข้อความล่าสุดจากผู้เช่า</div>
                    <p className="whitespace-pre-line wrap-break-word">{editing.tenant_message}</p>
                </div>
            )}
            {editing.reopen_count > 0 && <p className="text-xs text-red-600">ผู้เช่าแจ้งว่ายังไม่หาย {editing.reopen_count} ครั้ง</p>}
        </div>
    )
}

export default RepairTenantPanel
