import { formatPromptPayId } from '../lib/promptpay'
import { baht, dueDateOf, formatMonth, formatShortDate, invoiceCode, thaiBahtText } from '../lib/billing'

// เอกสารใบแจ้งหนี้ขนาด A4 (กว้าง 794px) ใช้สร้างไฟล์ PDF
// ใช้ inline style และสีแบบ hex ทั้งหมด เพื่อให้แปลงเป็นรูปได้ตรงกับที่เห็นและไม่ขึ้นกับธีมของเว็บ

const C = {
    primary: '#3368A0',
    dark: '#244B73',
    deep: '#1B3856',
    ink: '#1F2F3D',
    muted: '#5F7385',
    line: '#DFE5E3',
    sand: '#F5F3EE',
    mist: '#C8DFDB',
    red: '#B91C1C',
}

const statusMeta = {
    pending: { label: 'รอชำระ', bg: '#FEF3C7', fg: '#92400E' },
    review: { label: 'รอตรวจสอบสลิป', bg: '#E0F2FE', fg: '#075985' },
    paid: { label: 'ชำระแล้ว', bg: '#D1FAE5', fg: '#065F46' },
}

const th = { padding: '10px 10px', fontWeight: 600, fontSize: 12, color: C.dark, background: C.sand, borderBottom: `1px solid ${C.line}` }
const td = { padding: '11px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 13 }
const num = { fontVariantNumeric: 'tabular-nums' }

function Field({ label, children }) {
    return (
        <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{children}</div>
        </div>
    )
}

function InvoiceDocument({ invoice, tenant, floor, settings, qr, paidAt }) {
    const waterUnits = Math.max(0, (invoice.water_curr || 0) - (invoice.water_prev || 0))
    const elecUnits = Math.max(0, (invoice.elec_curr || 0) - (invoice.elec_prev || 0))
    const waterCost = waterUnits * Number(invoice.water_rate || 0)
    const elecCost = elecUnits * Number(invoice.elec_rate || 0)
    const commonFee = Number(invoice.common_fee || 0)

    const status = statusMeta[invoice.status] ?? statusMeta.pending
    const issueDate = formatShortDate(invoice.created_at ?? `${invoice.month}-01`)
    const dueDate = formatShortDate(dueDateOf(invoice.month, settings.dueDay))
    const isPaid = invoice.status === 'paid'

    const rows = [
        { name: 'ค่าเช่าห้องพัก', sub: `ประจำเดือน ${formatMonth(invoice.month)}`, prev: '-', curr: '-', qty: '1 งวด', rate: baht(invoice.rent), amount: baht(invoice.rent) },
        { name: 'ค่าน้ำประปา', sub: '', prev: invoice.water_prev, curr: invoice.water_curr, qty: `${waterUnits} หน่วย`, rate: baht(invoice.water_rate), amount: baht(waterCost) },
        { name: 'ค่าไฟฟ้า', sub: '', prev: invoice.elec_prev, curr: invoice.elec_curr, qty: `${elecUnits} หน่วย`, rate: baht(invoice.elec_rate), amount: baht(elecCost) },
    ]
    if (commonFee > 0) rows.push({ name: 'ค่าบริการส่วนกลาง', sub: '', prev: '-', curr: '-', qty: '1 งวด', rate: baht(commonFee), amount: baht(commonFee) })

    return (
        <div
            style={{
                width: 794,
                minHeight: 1123,
                boxSizing: 'border-box',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: '#FFFFFF',
                color: C.ink,
                fontFamily: "'Noto Sans Thai', 'Segoe UI', Tahoma, sans-serif",
                fontSize: 13,
                lineHeight: 1.45,
            }}
        >
            {/* หัวเอกสาร */}
            <div style={{ background: `linear-gradient(135deg, ${C.deep}, ${C.primary})`, color: '#FFFFFF', padding: '30px 44px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2" />
                        </svg>
                    </div>
                    <div>
                        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{settings.apartmentName}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.apartmentNameEn}</div>
                        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 8, maxWidth: 360 }}>
                            {settings.address}
                            <br />
                            โทร {settings.phone}
                            {settings.email ? ` · ${settings.email}` : ''}
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>ใบแจ้งหนี้</div>
                    <div style={{ fontSize: 12, letterSpacing: 3, opacity: 0.8, marginTop: 2 }}>INVOICE</div>
                    <div style={{ fontSize: 13, marginTop: 10, fontWeight: 600 }}>{invoiceCode(invoice)}</div>
                </div>
            </div>

            <div style={{ padding: '26px 44px 30px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* ข้อมูลผู้เช่า / ห้อง / วันที่ */}
                <div style={{ display: 'flex', gap: 14 }}>
                    <div style={{ flex: 1.2, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
                        <Field label="ผู้เช่า">{invoice.tenant_name || tenant?.name || '-'}</Field>
                        <Field label="เบอร์โทรศัพท์">{tenant?.phone || '-'}</Field>
                    </div>
                    <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
                        <Field label="ห้องพัก">{`ห้อง ${invoice.room}${floor ? ` (ชั้น ${floor})` : ''}`}</Field>
                        <Field label="งวดเดือน">{formatMonth(invoice.month)}</Field>
                    </div>
                    <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
                        <Field label="วันที่ออกใบแจ้งหนี้">{issueDate}</Field>
                        <Field label="ครบกำหนดชำระ">
                            <span style={{ color: isPaid ? C.ink : C.red }}>{dueDate}</span>
                        </Field>
                    </div>
                </div>

                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>สถานะ</span>
                    <span style={{ background: status.bg, color: status.fg, borderRadius: 999, padding: '2px 12px', fontSize: 12, fontWeight: 600 }}>{status.label}</span>
                </div>

                {/* ตารางรายการ */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, border: `1px solid ${C.line}` }}>
                    <thead>
                        <tr>
                            <th style={{ ...th, width: 36, textAlign: 'center' }}>#</th>
                            <th style={{ ...th, textAlign: 'left' }}>รายการ</th>
                            <th style={{ ...th, textAlign: 'center' }}>เลขมิเตอร์เดิม</th>
                            <th style={{ ...th, textAlign: 'center' }}>เลขมิเตอร์ล่าสุด</th>
                            <th style={{ ...th, textAlign: 'center' }}>จำนวน</th>
                            <th style={{ ...th, textAlign: 'right' }}>ราคา/หน่วย</th>
                            <th style={{ ...th, textAlign: 'right' }}>จำนวนเงิน</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={r.name}>
                                <td style={{ ...td, textAlign: 'center', color: C.muted }}>{i + 1}</td>
                                <td style={td}>
                                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                                    {r.sub && <div style={{ fontSize: 11, color: C.muted }}>{r.sub}</div>}
                                </td>
                                <td style={{ ...td, textAlign: 'center', ...num }}>{r.prev}</td>
                                <td style={{ ...td, textAlign: 'center', ...num }}>{r.curr}</td>
                                <td style={{ ...td, textAlign: 'center', ...num }}>{r.qty}</td>
                                <td style={{ ...td, textAlign: 'right', ...num }}>{r.rate}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 600, ...num }}>{r.amount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* ยอดรวม */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: 16, marginTop: 14 }}>
                    <div style={{ flex: 1, background: C.sand, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: 11, color: C.muted }}>จำนวนเงินตัวอักษร</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>({thaiBahtText(invoice.total)})</div>
                    </div>
                    <div style={{ width: 270, background: C.dark, color: '#FFFFFF', borderRadius: 12, padding: '12px 18px', textAlign: 'right' }}>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>ยอดรวมสุทธิ</div>
                        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, ...num }}>{baht(invoice.total)}</div>
                    </div>
                </div>

                {/* ช่องทางชำระเงิน */}
                {isPaid ? (
                    <div style={{ marginTop: 22, border: '1px solid #A7F3D0', background: '#ECFDF5', borderRadius: 12, padding: '16px 20px', color: '#065F46' }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>ชำระเงินเรียบร้อยแล้ว</div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                            ได้รับชำระ {baht(invoice.total)}{paidAt ? ` เมื่อ ${paidAt}` : ''} ขอบคุณที่ใช้บริการ
                        </div>
                    </div>
                ) : (
                    <div style={{ marginTop: 22, border: `1px solid ${C.line}`, borderRadius: 12, padding: '18px 20px', display: 'flex', gap: 22, alignItems: 'center' }}>
                        {qr && (
                            <div style={{ textAlign: 'center', flexShrink: 0 }}>
                                <img src={qr} alt="QR PromptPay" width={150} height={150} style={{ display: 'block', borderRadius: 8, border: `1px solid ${C.line}` }} />
                                <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginTop: 6 }}>สแกนจ่ายด้วยพร้อมเพย์</div>
                                <div style={{ fontSize: 11, color: C.muted }}>ยอด {baht(invoice.total)}</div>
                            </div>
                        )}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 8 }}>ช่องทางการชำระเงิน</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', rowGap: 4, fontSize: 13 }}>
                                <span style={{ color: C.muted }}>ธนาคาร</span>
                                <span style={{ fontWeight: 600 }}>{settings.bankName}</span>
                                <span style={{ color: C.muted }}>เลขที่บัญชี</span>
                                <span style={{ fontWeight: 600, ...num }}>{settings.bankAccount}</span>
                                <span style={{ color: C.muted }}>ชื่อบัญชี</span>
                                <span style={{ fontWeight: 600 }}>{settings.bankHolder}</span>
                                <span style={{ color: C.muted }}>พร้อมเพย์</span>
                                <span style={{ fontWeight: 600, ...num }}>{formatPromptPayId(settings.promptpayId)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                                กรุณาชำระภายในวันที่ {dueDate} และแนบสลิปการโอนเงินผ่านระบบผู้เช่าเพื่อยืนยันยอด
                            </div>
                        </div>
                    </div>
                )}

                {/* ท้ายเอกสาร */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: 34 }}>
                    <div style={{ fontSize: 10.5, color: C.muted }}>
                        เอกสารนี้ออกโดยระบบจัดการหอพัก
                        <br />
                        {invoiceCode(invoice)} · {settings.apartmentName}
                    </div>
                    <div style={{ width: 200, textAlign: 'center' }}>
                        <div style={{ borderBottom: `1px solid ${C.muted}`, height: 36 }} />
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>ผู้ดูแลหอพัก</div>
                    </div>
                </div>
            </div>

            {/* ตราประทับเมื่อชำระแล้ว */}
            {isPaid && (
                <div
                    style={{
                        position: 'absolute',
                        right: 64,
                        top: 652,
                        transform: 'rotate(-14deg)',
                        border: '5px solid rgba(5, 150, 105, 0.35)',
                        color: 'rgba(5, 150, 105, 0.35)',
                        borderRadius: 14,
                        padding: '4px 26px',
                        fontSize: 52,
                        fontWeight: 700,
                        letterSpacing: 2,
                    }}
                >
                    ชำระแล้ว
                </div>
            )}
        </div>
    )
}

export default InvoiceDocument
