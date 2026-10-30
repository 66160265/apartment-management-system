import MonthPicker from './MonthPicker'
import { ExportButton, Stat } from './ReportParts'
import { baht, formatMonth } from '../lib/billing'

// ส่วนสรุปบนสุดของหน้ารายงาน (pages/ReportsPage.jsx)

// ห้องพัก (ตอนนี้): อัตราเข้าพัก ห้องว่าง ยอดค้างทั้งหมด และยอดรอโอนคืนผู้เช่า
// occ = ผลของ occupancy(), outstandingCount/outstandingTotal = จำนวนใบและยอดค้างทุกเดือน
// pendingRefund = ยอดที่ผู้เช่าโอนเกินรอโอนคืน, depositToRefund = เงินประกันรอคืน
// จอเล็ก: 2 ช่องต่อแถว คำอธิบายสั้น
export function OccupancyStats({ occ, outstandingCount, outstandingTotal, pendingRefund, depositToRefund }) {
    const toRefund = pendingRefund + depositToRefund
    return (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <Stat label="อัตราเข้าพัก" value={`${occ.rate}%`} hint={`มีผู้เช่า ${occ.occupied} จาก ${occ.total - occ.maintenance} ห้อง (ไม่รวมปิดปรับปรุง)`} mobileHint={`${occ.occupied}/${occ.total - occ.maintenance} ห้อง`} />
            <Stat label="ห้องว่าง" value={occ.vacant} hint={occ.maintenance > 0 ? `ปิดปรับปรุง ${occ.maintenance} ห้อง` : undefined} mobileHint={occ.maintenance > 0 ? `ปรับปรุง ${occ.maintenance}` : null} />
            <Stat label="ยอดค้างทั้งหมด" value={baht(outstandingTotal)} hint={`${outstandingCount} ใบ ทุกเดือนที่ยังไม่ชำระ`} mobileHint={`${outstandingCount} ใบ`} tone={outstandingTotal > 0 ? 'text-amber-700' : 'text-primary-dark'} />
            <Stat label="รอโอนคืนผู้เช่า" value={baht(toRefund)} hint={`ยอดที่ผู้เช่าโอนเกิน ${baht(pendingRefund)} · เงินประกัน ${baht(depositToRefund)}`} mobileHint={`โอนเกิน ${baht(pendingRefund)} · ประกัน ${baht(depositToRefund)}`} tone={toRefund > 0 ? 'text-sky-700' : 'text-primary-dark'} />
        </section>
    )
}

// สรุปเดือนที่เลือก: ใบแจ้งหนี้ รายรับ ยอดค้าง รายจ่าย คงเหลือ โอนคืนยอดเกิน และปุ่มส่งออก CSV
// summary = ผลของ monthlySummary()
export function MonthSummary({ month, onMonthChange, summary, onExportInvoices, onExportPayments }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                <h2 className="font-medium text-primary-dark">สรุปเดือน {formatMonth(month)}</h2>
                <MonthPicker value={month} onChange={onMonthChange} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
                <Stat label={`ใบแจ้งหนี้ บิลเดือน ${formatMonth(summary.billMonth)}`} value={`${summary.issuedCount} ใบ`} hint={`ออกเดือน ${formatMonth(month)} · เรียกเก็บ ${baht(summary.billed)}`} mobileHint={`เรียกเก็บ ${baht(summary.billed)}`} />
                <Stat label="รับเงินจริงในเดือนนี้" value={baht(summary.receivedTotal)} hint="เงินที่ได้รับจริงในเดือนนี้: ค่าห้อง ค่าน้ำ-ไฟ ค่าซ่อมที่ผู้เช่าจ่าย และค่าปรับ" mobileHint={null} tone="text-emerald-700" />
                <Stat label={`ค้างของบิล ${formatMonth(summary.billMonth)}`} value={baht(summary.outstanding)} hint={`${summary.unpaidCount} ใบ ณ วันนี้`} tone={summary.outstanding > 0 ? 'text-amber-700' : 'text-primary-dark'} />
                <Stat label="รายจ่ายเดือนนี้" value={baht(summary.spent)} hint={<><span className="block">ค่าซ่อมที่หอพักจ่าย {baht(summary.repairCost)}</span><span className="block">ค่าใช้จ่ายของหอ {baht(summary.expenseTotal)}</span></>} mobileHint={`ซ่อม ${baht(summary.repairCost)} · หอ ${baht(summary.expenseTotal)}`} />
                <Stat label="คงเหลือเดือนนี้" value={baht(summary.net)} hint="รับเงินจริง − รายจ่ายเดือนนี้" tone={summary.net < 0 ? 'text-red-700' : 'text-emerald-700'} />
                <Stat label="โอนคืนยอดเกินในเดือนนี้" value={baht(summary.refunded)} hint={`ค่าปรับของบิลที่ชำระแล้ว ${baht(summary.lateFees)}`} mobileHint={null} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <ExportButton onClick={onExportInvoices} short={`บิล ${formatMonth(summary.billMonth)} CSV`}>ใบแจ้งหนี้ บิลเดือน {formatMonth(summary.billMonth)} (CSV)</ExportButton>
                <ExportButton onClick={onExportPayments} short="การรับเงิน CSV">การรับเงินเดือนนี้ (CSV)</ExportButton>
            </div>
        </section>
    )
}
