import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

const {
    monthOf, recentMonths, monthlySummary, monthlyRows, outstandingRows, occupancy, toCsv, invoiceColumns, outstandingColumns, monthlyColumns, paymentColumns,
    pendingDepositRefund, owedFromMoveOuts, moveOutColumns,
} = await import('./reports')

const now = new Date('2026-11-10T10:00:00+07:00')
const inv = (over = {}) => ({
    id: 'i1', room: '101', tenant_name: 'สมชาย', month: '2026-10', rent: 3500, water_prev: 100, water_curr: 110, water_rate: 18,
    elec_prev: 500, elec_curr: 560, elec_rate: 7, common_fee: 100, total: 4200, status: 'pending', paid_amount: 0, late_fee: 0, refund_amount: 0, refund_status: null,
    ...over,
})

describe('monthOf / recentMonths', () => {
    it('เดือนตามเวลาไทย (UTC 17:30 วันสิ้นเดือน = เดือนถัดไปในไทย)', () => {
        expect(monthOf('2026-10-31T17:30:00Z')).toBe('2026-11')
        expect(monthOf('2026-10-31T16:30:00Z')).toBe('2026-10')
        expect(monthOf(null)).toBe('')
    })

    it('ย้อนหลัง 12 เดือนข้ามปีได้ เรียงใหม่ไปเก่า', () => {
        const m = recentMonths('2026-02', 4)
        expect(m).toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
        expect(recentMonths('2026-10')).toHaveLength(12)
    })
})

describe('monthlySummary', () => {
    const data = {
        invoices: [
            inv({ id: 'a', total: 1000, status: 'paid', paid_amount: 1100, late_fee: 100, refund_amount: 0 }),
            inv({ id: 'b', room: '102', total: 2000, status: 'pending', paid_amount: 500 }),
            inv({ id: 'c', room: '103', total: 3000, status: 'paid', paid_amount: 3300, refund_amount: 300, refund_status: 'done', refunded_at: '2026-11-02T10:00:00+07:00' }),
            inv({ id: 'd', month: '2026-09', total: 999, status: 'paid', paid_amount: 999 }),
        ],
        invoicePayments: [
            { invoice_id: 'a', amount: 1100, confirmed_at: '2026-10-20T10:00:00+07:00' },
            { invoice_id: 'b', amount: 500, confirmed_at: '2026-10-25T10:00:00+07:00' },
            { invoice_id: 'c', amount: 3300, confirmed_at: '2026-11-01T10:00:00+07:00' },
            { invoice_id: 'd', amount: 999, confirmed_at: '2026-10-01T10:00:00+07:00' },
        ],
        repairPayments: [
            { status: 'paid', amount: 350, reviewed_at: '2026-10-15T10:00:00+07:00' },
            { status: 'review', amount: 999, reviewed_at: null },
            { status: 'paid', amount: 200, reviewed_at: '2026-11-03T10:00:00+07:00' },
        ],
    }

    it('นับรายรับตามวันที่ได้รับเงินจริง ไม่ใช่เดือนของใบ', () => {
        const oct = monthlySummary(data, '2026-10', now)
        // ตุลาคม: a 1100 + b 500 + d 999 (ใบเดือนก.ย. แต่ได้รับเงินเดือนต.ค.)
        expect(oct.received).toBe(2599)
        expect(oct.repairReceived).toBe(350)
        const nov = monthlySummary(data, '2026-11', now)
        expect(nov.received).toBe(3300)
        expect(nov.repairReceived).toBe(200)
        expect(nov.refunded).toBe(300)
    })

    it('ยอดเรียกเก็บ ค่าปรับ และใบที่ออกในเดือน', () => {
        const oct = monthlySummary(data, '2026-10', now)
        expect(oct.issuedCount).toBe(3)
        expect(oct.billed).toBe(6000)
        expect(oct.lateFees).toBe(100)
    })

    it('ยอดค้างของเดือนนี้ นับเฉพาะใบที่ยังไม่ชำระ หักที่ได้รับแล้ว', () => {
        const oct = monthlySummary(data, '2026-10', now)
        expect(oct.unpaidCount).toBe(1)
        expect(oct.outstanding).toBe(1500)
    })

    it('ใบที่ยังไม่ชำระและมีค่าปรับ ยอดค้างรวมค่าปรับของวันนี้', () => {
        const late = inv({ id: 'x', total: 1000, due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 0, late_fee_cap: null })
        const s = monthlySummary({ invoices: [late], invoicePayments: [], repairPayments: [] }, '2026-10', now)
        expect(s.outstanding).toBe(1250)
    })

    it('เดือนที่ไม่มีข้อมูล = ศูนย์ทั้งหมด', () => {
        expect(monthlySummary(data, '2025-01', now)).toMatchObject({ issuedCount: 0, billed: 0, received: 0, outstanding: 0, unpaidCount: 0 })
    })

    it('monthlyRows คืนตามลำดับเดือนที่ส่ง', () => {
        expect(monthlyRows(data, ['2026-11', '2026-10'], now).map((r) => r.month)).toEqual(['2026-11', '2026-10'])
    })
})

describe('outstandingRows', () => {
    it('เรียงเกินกำหนดนานสุดก่อน และไม่รวมใบที่ชำระแล้ว', () => {
        const rows = outstandingRows([
            inv({ id: '1', room: '102', month: '2026-10', due_date: '2026-11-08', late_fee_rate: 0 }),
            inv({ id: '2', room: '101', month: '2026-09', due_date: '2026-10-05', late_fee_rate: 0 }),
            inv({ id: '3', room: '103', status: 'paid', paid_amount: 4200 }),
            inv({ id: '4', room: '104', month: '2026-10', status: 'review' }),
        ], now)
        expect(rows.map((r) => r.room)).toEqual(['101', '102', '104'])
        expect(rows[0]).toMatchObject({ daysLate: 36, balance: 4200 })
    })

    it('ใบที่คงเหลือ 0 ไม่แสดง', () => {
        expect(outstandingRows([inv({ paid_amount: 4200 })], now)).toEqual([])
    })
})

describe('occupancy', () => {
    it('นับตามสถานะ อัตราเข้าพักไม่รวมห้องปิดปรับปรุง', () => {
        const rooms = [
            ...Array.from({ length: 6 }, () => ({ status: 'occupied' })),
            ...Array.from({ length: 3 }, () => ({ status: 'vacant' })),
            { status: 'maintenance' },
        ]
        expect(occupancy(rooms)).toEqual({ total: 10, occupied: 6, vacant: 3, maintenance: 1, rate: 66.7 })
    })

    it('ไม่มีห้อง = อัตรา 0 ไม่หารศูนย์', () => {
        expect(occupancy([])).toMatchObject({ total: 0, rate: 0 })
        expect(occupancy([{ status: 'maintenance' }]).rate).toBe(0)
    })
})

describe('toCsv', () => {
    const cols = [{ header: 'ชื่อ', value: (r) => r.name }, { header: 'ยอด', value: (r) => r.amount }]

    it('หัวตารางและแถว ขึ้นบรรทัดแบบ CRLF', () => {
        expect(toCsv([{ name: 'สมชาย', amount: 1200.5 }], cols)).toBe('ชื่อ,ยอด\r\nสมชาย,1200.5')
    })

    it('ครอบด้วยเครื่องหมายคำพูดเมื่อมีจุลภาค เครื่องหมายคำพูด หรือขึ้นบรรทัด', () => {
        const csv = toCsv([{ name: 'นาย "เอ", บี', amount: 1 }, { name: 'บรรทัด1\nบรรทัด2', amount: 2 }], cols)
        expect(csv).toBe('ชื่อ,ยอด\r\n"นาย ""เอ"", บี",1\r\n"บรรทัด1\nบรรทัด2",2')
    })

    it('กัน CSV injection: ข้อความที่ขึ้นต้นด้วยสัญลักษณ์สูตรถูกนำหน้าด้วย \'', () => {
        for (const evil of ['=1+1', '+cmd', '-2', '@SUM(A1)', '\tx']) {
            const csv = toCsv([{ name: evil, amount: 1 }], cols)
            expect(csv.split('\r\n')[1].startsWith("'")).toBe(true)
        }
    })

    it('ตัวเลขติดลบจริงไม่ถูกแก้ ค่าว่างเป็นช่องว่าง', () => {
        expect(toCsv([{ name: null, amount: -5 }], cols)).toBe('ชื่อ,ยอด\r\n,-5')
    })

    it('ไม่มีแถว = มีแต่หัวตาราง', () => {
        expect(toCsv([], cols)).toBe('ชื่อ,ยอด')
    })
})

describe('ย้ายออกและเงินประกัน', () => {
    const m = (over = {}) => ({
        room: '101', tenant_name: 'สมชาย', move_out_date: '2026-10-31', deposit: 5000, deductions_total: 1200, refund_amount: 3800, owed_amount: 0,
        refund_status: 'pending', refunded_at: null, deductions: [{ label: 'ค่าทำความสะอาด', amount: 500 }, { label: 'ค่าซ่อมประตู', amount: 700 }], ...over,
    })

    it('รวมเฉพาะเงินประกันที่รอคืน', () => {
        expect(pendingDepositRefund([m(), m({ refund_amount: 1000, refund_status: 'done' }), m({ refund_amount: 200 }), m({ refund_amount: 0, refund_status: 'none' })])).toBe(4000)
        expect(pendingDepositRefund([])).toBe(0)
    })

    it('รวมยอดที่ผู้เช่าต้องจ่ายเพิ่ม', () => {
        expect(owedFromMoveOuts([m({ owed_amount: 800 }), m({ owed_amount: 0 }), m({ owed_amount: 150.5 })])).toBe(950.5)
    })

    it('ส่งออก CSV: สถานะเป็นภาษาไทย วันที่คืนตามเวลาไทย และรวมรายการหัก', () => {
        const csv = toCsv([m(), m({ refund_status: 'done', refunded_at: '2026-11-02T23:30:00+07:00' })], moveOutColumns).split('\r\n')
        expect(csv[1]).toBe('2026-10-31,101,สมชาย,5000,1200,3800,0,รอคืนเงิน,,ค่าทำความสะอาด 500 / ค่าซ่อมประตู 700')
        expect(csv[2]).toContain('คืนแล้ว,2026-11-02,')
    })

    it('รายการหักที่เป็นสูตรถูกกัน CSV injection', () => {
        const csv = toCsv([m({ deductions: [{ label: '=cmd', amount: 1 }] })], moveOutColumns)
        expect(csv).toContain("=cmd 1")
        expect(csv.split('\r\n')[1].endsWith(',=cmd 1')).toBe(false)
    })
})

describe('คอลัมน์ส่งออก', () => {
    it('ใบแจ้งหนี้: คำนวณหน่วยและค่าน้ำไฟ ค่าปรับแสดงเฉพาะใบที่ชำระแล้ว', () => {
        const csv = toCsv([inv(), inv({ id: 'p', status: 'paid', late_fee: 100, paid_amount: 4300 })], invoiceColumns)
        const [header, a, b] = csv.split('\r\n')
        expect(header).toContain('ยอดบิล')
        expect(a).toBe('2026-10,101,สมชาย,3500,10,180,60,420,100,4200,,0,รอชำระ')
        expect(b).toBe('2026-10,101,สมชาย,3500,10,180,60,420,100,4200,100,4300,ชำระแล้ว')
    })

    it('ชื่อผู้เช่าที่เป็นสูตรถูกกันในไฟล์ส่งออกจริง', () => {
        expect(toCsv([inv({ tenant_name: '=HYPERLINK("x")' })], invoiceColumns)).toContain(`"'=HYPERLINK(""x"")"`)
    })

    it('ยอดค้าง: ใช้ข้อมูลที่คำนวณแล้ว', () => {
        const rows = outstandingRows([inv({ due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 0 })], now)
        expect(toCsv(rows, outstandingColumns).split('\r\n')[1]).toBe('101,สมชาย,2026-10,4200,0,4450,5,รอชำระ')
    })

    it('รายเดือน', () => {
        const row = monthlySummary({ invoices: [inv()], invoicePayments: [], repairPayments: [] }, '2026-10', now)
        expect(toCsv([row], monthlyColumns).split('\r\n')[1]).toBe('2026-10,1,4200,0,0,0,0,1,4200')
    })

    it('การรับเงิน: ดึงห้อง/ผู้เช่าจากใบแจ้งหนี้ ใบที่ไม่พบเป็นช่องว่าง', () => {
        const byId = { i1: inv() }
        const csv = toCsv(
            [
                { invoice_id: 'i1', amount: 1000, confirmed_at: '2026-10-20T23:30:00+07:00', auto_approved: true, trans_ref: 'T1' },
                { invoice_id: 'gone', amount: 5, confirmed_at: '2026-10-21T01:00:00+07:00', auto_approved: false, trans_ref: null },
            ],
            paymentColumns(byId),
        )
        const [, a, b] = csv.split('\r\n')
        expect(a).toBe('2026-10-20,101,สมชาย,2026-10,1000,ระบบอัตโนมัติ,T1')
        expect(b).toBe('2026-10-21,,,,5,แอดมิน,')
    })
})
