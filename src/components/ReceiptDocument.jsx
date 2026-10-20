import { baht, formatShortDate, thaiBahtText } from '../lib/billing'

// เอกสารใบเสร็จรับเงินขนาด A4 (กว้าง 794px) ใช้สร้างไฟล์ PDF (lib/receiptPdf.jsx) หน้าตาเดียวกับใบแจ้งหนี้
// ใช้ inline style และสีแบบ hex ทั้งหมด เพื่อให้แปลงเป็นรูปได้ตรงกับที่เห็นและไม่ขึ้นกับธีมของเว็บ
// receipt = ข้อมูลจาก lib/receipts.js (buildInvoiceReceipt / buildRepairReceipt)

const C = {
    primary: '#2F7D5B',
    dark: '#1F5E44',
    deep: '#164632',
    ink: '#1F2F3D',
    muted: '#5F7385',
    line: '#DFE5E3',
    sand: '#F5F3EE',
    green: '#065F46',
    greenBg: '#D1FAE5',
    amber: '#92400E',
    amberBg: '#FEF3C7',
}

const th = { padding: '10px 12px', fontWeight: 600, fontSize: 12, color: C.dark, background: C.sand, borderBottom: `1px solid ${C.line}`, textAlign: 'left' }
const td = { padding: '12px', borderBottom: `1px solid ${C.line}`, fontSize: 13, verticalAlign: 'top' }
const num = { fontVariantNumeric: 'tabular-nums' }

function Field({ label, children }) {
    return (
        <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{children}</div>
        </div>
    )
}

// แถวสรุปยอดด้านล่างตาราง (ป้ายซ้าย ตัวเลขขวา)
function SummaryRow({ label, value, strong, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '4px 0', fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: color ?? C.ink }}>
            <span style={{ color: strong ? color ?? C.ink : C.muted }}>{label}</span>
            <span style={num}>{value}</span>
        </div>
    )
}

function ReceiptDocument({ receipt, tenant, floor, settings }) {
    const isFinal = receipt.status === 'paid'
    const date = formatShortDate(new Date(receipt.date))
    const time = new Date(receipt.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

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
            {/* หัวเอกสาร: ข้อมูลหอพักและชื่อเอกสาร */}
            <div style={{ background: `linear-gradient(135deg, ${C.deep}, ${C.primary})`, color: '#FFFFFF', padding: '30px 44px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{settings.apartmentName}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.apartmentNameEn}</div>
                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 8, maxWidth: 360 }}>
                        {settings.address}
                        {settings.address && (settings.phone || settings.email) && <br />}
                        {settings.phone && `โทร ${settings.phone}`}
                        {settings.email ? `${settings.phone ? ' · ' : ''}${settings.email}` : ''}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>ใบเสร็จรับเงิน</div>
                    <div style={{ fontSize: 12, letterSpacing: 3, opacity: 0.8, marginTop: 2 }}>RECEIPT</div>
                    {receipt.code && <div style={{ fontSize: 13, marginTop: 10, fontWeight: 600 }}>เลขที่ {receipt.code}</div>}
                </div>
            </div>

            <div style={{ padding: '26px 44px 30px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* ผู้ชำระ / ห้อง / วันที่รับเงิน */}
                <div style={{ display: 'flex', gap: 14 }}>
                    <div style={{ flex: 1.2, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
                        <Field label="ได้รับเงินจาก">{receipt.tenantName || tenant?.name || '-'}</Field>
                        <Field label="เบอร์โทรศัพท์">{tenant?.phone || '-'}</Field>
                    </div>
                    <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
                        <Field label="ห้องพัก">{`ห้อง ${receipt.room}${floor ? ` (ชั้น ${floor})` : ''}`}</Field>
                        {receipt.reference && <Field label="อ้างอิงใบแจ้งหนี้">{receipt.reference}</Field>}
                    </div>
                    <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
                        <Field label="วันที่รับเงิน">{date}</Field>
                        <Field label="เวลา">{time} น.</Field>
                    </div>
                </div>

                {/* สถานะ: ชำระครบ / รับบางส่วน */}
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ padding: '4px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: isFinal ? C.greenBg : C.amberBg, color: isFinal ? C.green : C.amber }}>
                        {isFinal ? 'ชำระครบแล้ว' : 'รับชำระบางส่วน'}
                    </span>
                    {receipt.installment && (
                        <span style={{ fontSize: 12, color: C.muted }}>การรับเงินครั้งที่ {receipt.installment.number} จาก {receipt.installment.of} ครั้ง</span>
                    )}
                </div>

                {/* รายการที่รับเงิน */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
                    <thead>
                        <tr>
                            <th style={th}>รายการ</th>
                            <th style={{ ...th, textAlign: 'right', width: 170 }}>จำนวนเงินที่ได้รับ</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={td}>
                                <div style={{ fontWeight: 600 }}>{receipt.description}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                    {receipt.source === 'deposit'
                                        ? 'หักจากเงินประกันตอนย้ายออก'
                                        : receipt.kind === 'invoice' ? 'รับชำระโดยการโอนเงิน (ตรวจสอบสลิปแล้ว)' : 'รับชำระค่าซ่อมโดยการโอนเงิน (ตรวจสอบสลิปแล้ว)'}
                                    {receipt.transRef && ` · เลขอ้างอิงธนาคาร ${receipt.transRef}`}
                                </div>
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700, ...num }}>{baht(receipt.amount)}</td>
                        </tr>
                    </tbody>
                </table>

                {/* จำนวนเงินตัวอักษร และสรุปยอด */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: 16, marginTop: 16 }}>
                    <div style={{ flex: 1, background: C.sand, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: 11, color: C.muted }}>จำนวนเงินตัวอักษร</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>({thaiBahtText(receipt.amount)})</div>
                    </div>
                    <div style={{ width: 300, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 16px' }}>
                        {receipt.kind === 'invoice' && (
                            <>
                                <SummaryRow label="ยอดใบแจ้งหนี้" value={baht(receipt.billTotal)} />
                                {receipt.lateFee > 0 && <SummaryRow label="ค่าปรับชำระล่าช้า" value={baht(receipt.lateFee)} />}
                                {isFinal && receipt.lateFee > 0 && <SummaryRow label="รวมที่ต้องชำระ" value={baht(receipt.dueTotal)} />}
                                <SummaryRow label="รับชำระครั้งนี้" value={baht(receipt.amount)} />
                                <SummaryRow label="รับชำระสะสม" value={baht(receipt.cumulative)} strong color={C.green} />
                                {!isFinal && <div style={{ fontSize: 11, color: C.amber, paddingTop: 4 }}>ยังชำระไม่ครบ ผู้เช่าต้องโอนส่วนที่เหลือเพิ่ม</div>}
                                {receipt.overpaid > 0 && (
                                    <div style={{ fontSize: 11, color: C.muted, paddingTop: 4 }}>
                                        {receipt.refunded ? `โอนคืนยอดที่ชำระเกิน ${baht(receipt.overpaid)} แล้ว` : `ยอดที่ชำระเกิน ${baht(receipt.overpaid)} หอพักจะโอนคืนให้`}
                                    </div>
                                )}
                            </>
                        )}
                        {receipt.kind === 'repair' && <SummaryRow label="รวมรับชำระ" value={baht(receipt.amount)} strong color={C.green} />}
                    </div>
                </div>

                {/* ท้ายเอกสาร */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: 60 }}>
                    <div style={{ fontSize: 10.5, color: C.muted }}>
                        เอกสารนี้ออกโดยระบบจัดการหอพัก{receipt.autoApproved ? ' (ตรวจสอบสลิปอัตโนมัติ)' : ''}
                        <br />
                        {receipt.code ? `${receipt.code} · ` : ''}{settings.apartmentName}
                    </div>
                    <div style={{ width: 200, textAlign: 'center' }}>
                        <div style={{ borderBottom: `1px solid ${C.muted}`, height: 36 }} />
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>ผู้รับเงิน</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ReceiptDocument
