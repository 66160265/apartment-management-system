import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'
import RenewContractModal from './RenewContractModal'
import { ContractBadge } from './TenantParts'
import { loadRenewals } from '../lib/contracts'
import { useRealtimeReload } from '../lib/realtime'
import { formatDateTime } from '../lib/billing'
import { contractStatus, formatDate } from '../lib/tenants'
import { SkeletonList } from './Skeleton.jsx'

// การ์ด "สัญญาเช่า" ในหน้ารายละเอียดผู้เช่า (แอดมิน): วันสิ้นสุด สถานะ ปุ่มต่อสัญญา และประวัติการต่อสัญญา
// endDate = วันสิ้นสุดสัญญาปัจจุบัน onRenewed(newEnd) เรียกหลังต่อสำเร็จ (หน้าแม่อัปเดตวันที่ในฟอร์มด้วย กันบันทึกฟอร์มแล้วทับวันที่ใหม่)
function ContractSection({ tenant, endDate, onRenewed }) {
    const [open, setOpen] = useState(false)
    // null = ยังโหลดไม่เสร็จ / ไม่มีตารางประวัติ (ยังไม่ได้รัน migration) แล้วแต่ unavailable
    const [renewals, setRenewals] = useState(null)
    const [unavailable, setUnavailable] = useState(false)

    const reload = useCallback(async () => {
        const list = await loadRenewals(tenant.room)
        setUnavailable(list === null)
        setRenewals(list)
    }, [tenant.room])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        reload()
    }, [reload])

    // ต่อสัญญา/แก้วันที่จากที่อื่น (เช่น แอดมินอีกคน) ประวัติอัปเดตเอง
    useRealtimeReload(['tenants'], reload)

    const status = contractStatus(endDate)

    const handleRenewed = async (newEnd) => {
        setOpen(false)
        await onRenewed(newEnd)
        await reload()
    }

    return (
        <section aria-label="สัญญาเช่า" className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-primary-dark">สัญญาเช่า</h2>
                    <p className="text-sm text-muted">
                        {formatDate(tenant.startDate)} – {formatDate(endDate)} · {status.hint}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ContractBadge endDate={endDate} />
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl shadow-card text-sm font-medium"
                    >
                        <Icon name="calendar" className="w-4 h-4" />
                        ต่อสัญญา
                    </button>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-medium text-primary-dark mb-2">ประวัติการต่อสัญญา</h3>
                {unavailable ? (
                    <p className="text-sm text-muted">ยังดูประวัติไม่ได้ (ฐานข้อมูลยังไม่ได้เพิ่มส่วนต่อสัญญา)</p>
                ) : renewals === null ? (
                    <SkeletonList rows={2} avatar={false} className="-mx-4" />
                ) : renewals.length === 0 ? (
                    <p className="text-sm text-muted">ยังไม่เคยต่อสัญญาในระบบ</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-line/70 border border-line rounded-xl">
                        {renewals.map((r) => (
                            <li key={r.id} className="px-4 py-3 text-sm flex flex-col gap-0.5">
                                <span className="font-medium text-ink">
                                    ต่อจาก {formatDate(r.previous_end_date)} เป็น {formatDate(r.new_end_date)}
                                </span>
                                <span className="text-xs text-muted">เมื่อ {formatDateTime(r.created_at)}</span>
                                {r.note && <span className="text-muted whitespace-pre-wrap">{r.note}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {open && (
                <RenewContractModal
                    room={tenant.room}
                    tenantName={tenant.name}
                    currentEnd={endDate}
                    onClose={() => setOpen(false)}
                    onRenewed={handleRenewed}
                />
            )}
        </section>
    )
}

export default ContractSection
