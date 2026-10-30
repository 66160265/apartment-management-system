import { ExportButton, MobileCard } from './ReportParts'
import { baht } from '../lib/billing'
import { formatDate } from '../lib/tenants'

// ส่วนเรื่องห้องและผู้เช่าของหน้ารายงาน (pages/ReportsPage.jsx): ห้องว่าง สัญญาใกล้หมด และย้ายออก/เงินประกัน

// ห้องว่าง (ว่างมากี่วัน) และสัญญาที่จะหมดใน 90 วัน vacancies = ผลของ vacancyRows(), expiring = ผลของ expiringContracts()
export function VacancyAndContracts({ vacancies, expiring }) {
    return (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                <h2 className="font-medium text-primary-dark">ห้องว่าง ({vacancies.length} ห้อง)</h2>
                {vacancies.length === 0 ? (
                    <p className="text-sm text-muted py-4 text-center">ไม่มีห้องว่าง</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted border-b border-line">
                                    <th className="py-2 pr-3">ห้อง</th>
                                    <th className="py-2 px-3">ว่างตั้งแต่</th>
                                    <th className="py-2 pl-3 text-right">ว่างมา</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vacancies.map((v) => (
                                    <tr key={v.room} className="border-b border-line/60">
                                        <td className="py-2 pr-3 font-medium text-ink">{v.room} <span className="text-xs font-normal text-muted">· {baht(v.rent)}/เดือน</span></td>
                                        <td className="py-2 px-3">{v.since ? formatDate(v.since) : <span className="text-muted">ไม่มีบันทึกย้ายออก</span>}</td>
                                        <td className="py-2 pl-3 text-right tabular-nums">{v.days === null ? '-' : `${v.days} วัน`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-xs text-muted">นับจากวันที่ผู้เช่าคนล่าสุดย้ายออก</p>
            </section>

            <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                <h2 className="font-medium text-primary-dark">สัญญาที่จะหมดใน 90 วัน ({expiring.length} ห้อง)</h2>
                {expiring.length === 0 ? (
                    <p className="text-sm text-muted py-4 text-center">ไม่มีสัญญาที่ใกล้หมด</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted border-b border-line">
                                    <th className="py-2 pr-3">ห้อง / ผู้เช่า</th>
                                    <th className="py-2 px-3">สิ้นสุดสัญญา</th>
                                    <th className="py-2 pl-3 text-right">เหลือ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expiring.map((c) => (
                                    <tr key={c.room} className="border-b border-line/60">
                                        <td className="py-2 pr-3 text-ink">{c.room} <span className="text-muted">· {c.name}</span></td>
                                        <td className="py-2 px-3">{formatDate(c.endDate)}</td>
                                        <td className={`py-2 pl-3 text-right tabular-nums font-medium ${c.daysLeft < 0 ? 'text-red-700' : c.daysLeft <= 30 ? 'text-amber-700' : 'text-ink'}`}>
                                            {c.daysLeft < 0 ? `หมดแล้ว ${-c.daysLeft} วัน` : `${c.daysLeft} วัน`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-xs text-muted">ควรคุยเรื่องต่อสัญญาล่วงหน้า ต่อสัญญาได้ที่หน้าผู้เช่า</p>
            </section>
        </div>
    )
}

// สถานะการคืนเงินประกัน
function RefundStatus({ status }) {
    if (status === 'pending') return <span className="text-sky-700 font-medium">รอคืนเงิน</span>
    if (status === 'done') return <span className="text-emerald-700">คืนแล้ว</span>
    return <span className="text-muted">ไม่มียอดคืน</span>
}

// ย้ายออกและเงินประกัน (แสดง 20 รายการล่าสุด) moveOuts = ตาราง move_outs, owed = ยอดรวมที่ผู้เช่าที่ย้ายออกต้องจ่ายเพิ่ม
export function MoveOutsSection({ moveOuts, owed, onExport }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium text-primary-dark">ย้ายออกและเงินประกัน ({moveOuts.length} ราย)</h2>
                <ExportButton onClick={onExport}>ย้ายออก/เงินประกัน (CSV)</ExportButton>
            </div>
            {owed > 0 && (
                <p className="text-sm text-red-800 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2.5">
                    ผู้เช่าที่ย้ายออกมียอดต้องจ่ายเพิ่ม (หักเกินเงินประกัน) รวม {baht(owed)} ระบบไม่ติดตามยอดนี้ ควรเรียกเก็บนอกระบบ
                </p>
            )}
            <ul className="md:hidden flex flex-col gap-2">
                {moveOuts.slice(0, 20).map((m) => (
                    <MobileCard
                        key={m.id}
                        title={<><span className="font-medium">{m.room}</span> <span className="text-muted">· {m.tenant_name}</span><span className="block text-xs text-muted">ย้ายออก {formatDate(m.move_out_date)}</span></>}
                        aside={<RefundStatus status={m.refund_status} />}
                        rows={[
                            ['เงินประกัน', baht(m.deposit)],
                            ['หัก', baht(m.deductions_total)],
                            ['คืนผู้เช่า', Number(m.refund_amount) > 0 ? baht(m.refund_amount) : '-', Number(m.refund_amount) > 0 ? 'font-medium text-emerald-700' : 'text-muted'],
                            ['ต้องจ่ายเพิ่ม', Number(m.owed_amount) > 0 ? baht(m.owed_amount) : '-', Number(m.owed_amount) > 0 ? 'font-medium text-red-700' : 'text-muted'],
                        ]}
                    />
                ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[760px] table-fixed">
                    {/* ความกว้างคอลัมน์คงที่: ห้อง/ผู้เช่ากว้างกว่า ช่องเงิน 4 ช่องเท่ากัน */}
                    <colgroup>
                        <col className="w-[12%]" />
                        <col className="w-[22%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                        <col className="w-[14%]" />
                    </colgroup>
                    <thead>
                        <tr className="text-left text-muted border-b border-line">
                            <th className="py-2 pr-3">ย้ายออก</th>
                            <th className="py-2 px-3">ห้อง / ผู้เช่า</th>
                            <th className="py-2 px-3 text-right">เงินประกัน</th>
                            <th className="py-2 px-3 text-right">หัก</th>
                            <th className="py-2 px-3 text-right">คืนผู้เช่า</th>
                            <th className="py-2 px-3 text-right">ต้องจ่ายเพิ่ม</th>
                            <th className="py-2 pl-6">สถานะ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {moveOuts.slice(0, 20).map((m) => (
                            <tr key={m.id} className="border-b border-line/60">
                                <td className="py-2.5 pr-3">{formatDate(m.move_out_date)}</td>
                                <td className="py-2.5 px-3 text-ink truncate"><span className="font-medium">{m.room}</span> <span className="text-muted">· {m.tenant_name}</span></td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{baht(m.deposit)}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{baht(m.deductions_total)}</td>
                                <td className={`py-2.5 px-3 text-right tabular-nums ${Number(m.refund_amount) > 0 ? 'font-medium text-emerald-700' : 'text-muted'}`}>
                                    {Number(m.refund_amount) > 0 ? baht(m.refund_amount) : '-'}
                                </td>
                                <td className={`py-2.5 px-3 text-right tabular-nums ${Number(m.owed_amount) > 0 ? 'font-medium text-red-700' : 'text-muted'}`}>
                                    {Number(m.owed_amount) > 0 ? baht(m.owed_amount) : '-'}
                                </td>
                                <td className="py-2.5 pl-6"><RefundStatus status={m.refund_status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
