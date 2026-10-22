import { describe, expect, it } from 'vitest'
import { auditActionOf, auditActorName, auditActions, auditDetailRows, auditGroups, matchesAudit } from './audit'

describe('auditActionOf', () => {
    it('action ที่รู้จักมีป้ายภาษาไทย', () => {
        expect(auditActionOf('payment.confirm').label).toBe('ยืนยันรับเงิน')
    })

    it('action ที่ไม่รู้จักแสดงชื่อตรง ๆ ไม่ error', () => {
        expect(auditActionOf('something.new')).toMatchObject({ label: 'something.new' })
    })

    it('ทุก action ที่ฐานข้อมูลบันทึก (ส่วน audit ของไฟล์ migration) มีป้าย', () => {
        for (const a of ['invoice.create', 'invoice.edit_total', 'invoice.status', 'invoice.delete', 'payment.confirm', 'refund.done', 'repair.cost',
            'repair_payment.paid', 'repair_payment.rejected', 'tenant.create', 'tenant.delete', 'settings.update',
            'contract.renew', 'announcement.create', 'announcement.update', 'announcement.delete']) {
            expect(auditActions[a]).toBeTruthy()
        }
    })
})

describe('auditGroups', () => {
    it('ครอบคลุมทุกตารางที่บันทึก', () => {
        const entities = auditGroups.flatMap((g) => g.entities ?? [])
        for (const e of ['invoices', 'invoice_payments', 'repairs', 'repair_payments', 'tenants', 'app_settings', 'announcements']) expect(entities).toContain(e)
    })

    it('กลุ่ม "ทั้งหมด" ไม่กรอง', () => {
        expect(auditGroups[0].entities).toBeNull()
    })
})

describe('auditActorName', () => {
    it('ระบบอัตโนมัติ (ไม่มีผู้ใช้)', () => {
        expect(auditActorName({ actor_role: 'system', actor_id: null })).toBe('ระบบอัตโนมัติ')
    })

    it('แสดงอีเมลเมื่อมี ไม่งั้นแสดงตามสิทธิ์', () => {
        expect(auditActorName({ actor_role: 'admin', actor_id: 'a', actor_email: 'admin@x.com' })).toBe('admin@x.com')
        expect(auditActorName({ actor_role: 'admin', actor_id: 'a', actor_email: null })).toBe('ผู้ดูแลระบบ')
        expect(auditActorName({ actor_role: 'user', actor_id: 'u', actor_email: null })).toBe('ผู้เช่า')
    })
})

describe('auditDetailRows', () => {
    it('การตั้งค่าแสดงเป็นชื่อช่อง ค่าเดิม → ค่าใหม่', () => {
        const rows = auditDetailRows({ action: 'settings.update', detail: { promptpay_id: { old: '', new: '081-234-5678' }, late_fee_cap: { old: null, new: 500 } } })
        expect(rows).toEqual([['พร้อมเพย์', 'ว่าง → 081-234-5678'], ['เพดานค่าปรับ', 'ว่าง → 500']])
    })

    it('ช่องที่ไม่รู้จักแสดงชื่อคอลัมน์ตรง ๆ', () => {
        expect(auditDetailRows({ action: 'settings.update', detail: { new_column: { old: 1, new: 2 } } })).toEqual([['new_column', '1 → 2']])
    })

    it('เหตุการณ์อื่นแสดงทีละคีย์ ค่าที่เป็นอ็อบเจ็กต์/อาร์เรย์เป็น JSON', () => {
        const rows = auditDetailRows({ action: 'invoice.edit_total', detail: { old: 1000, new: 1200, water: [1, 2, 3, 4], reason: null } })
        expect(rows).toContainEqual(['old', '1000'])
        expect(rows).toContainEqual(['water', '[1,2,3,4]'])
        expect(rows).toContainEqual(['reason', 'ว่าง'])
    })

    it('ไม่มี detail ไม่ error', () => {
        expect(auditDetailRows({ action: 'x' })).toEqual([])
    })
})

describe('matchesAudit', () => {
    const e = { room: '101', summary: 'ยืนยันรับเงิน ห้อง 101 ฿1,000', actor_role: 'admin', actor_id: 'a', actor_email: 'somchai@x.com', action: 'payment.confirm' }

    it('ว่าง = ตรงทุกแถว', () => {
        expect(matchesAudit(e, '')).toBe(true)
        expect(matchesAudit(e, '   ')).toBe(true)
    })

    it('ค้นหาจากห้อง ข้อความ อีเมล และชื่อเหตุการณ์ (ไม่สนตัวพิมพ์)', () => {
        expect(matchesAudit(e, '101')).toBe(true)
        expect(matchesAudit(e, 'SOMCHAI')).toBe(true)
        expect(matchesAudit(e, 'ยืนยันรับเงิน')).toBe(true)
        expect(matchesAudit(e, '999')).toBe(false)
    })
})

describe('รายละเอียดเหตุการณ์ใหม่ (ต่อสัญญา / ประกาศ)', () => {
    it('ป้ายภาษาไทยของแต่ละเหตุการณ์', () => {
        expect(auditActionOf('contract.renew').label).toBe('ต่อสัญญา')
        expect(auditActionOf('announcement.create').label).toBe('ลงประกาศ')
        expect(auditActionOf('announcement.update').label).toBe('แก้ประกาศ')
        expect(auditActionOf('announcement.delete').label).toBe('ลบประกาศ')
    })

    it('ต่อสัญญา: แสดงวันเดิม วันใหม่ หมายเหตุเป็นภาษาไทย', () => {
        const rows = auditDetailRows({ action: 'contract.renew', detail: { previous_end_date: '2026-12-31', new_end_date: '2027-12-31', note: 'ต่อ 1 ปี' } })
        expect(rows).toEqual([['วันสิ้นสุดเดิม', '2026-12-31'], ['วันสิ้นสุดใหม่', '2027-12-31'], ['หมายเหตุ', 'ต่อ 1 ปี']])
    })

    it('แก้ประกาศ: แสดง "ค่าเดิม → ค่าใหม่" ของหัวข้อและสถานะสำคัญ', () => {
        const rows = auditDetailRows({ action: 'announcement.update', detail: { title: { old: 'งดน้ำ', new: 'งดน้ำ (เลื่อน)' }, important: { old: false, new: true } } })
        expect(rows).toEqual([['หัวข้อ', 'งดน้ำ → งดน้ำ (เลื่อน)'], ['ประกาศสำคัญ', 'false → true']])
    })

    it('ต่อสัญญาอยู่ในกลุ่ม "ผู้เช่า" (entity tenants) และประกาศมีกลุ่มของตัวเอง', () => {
        expect(auditGroups.find((g) => g.value === 'tenants').entities).toContain('tenants')
        expect(auditGroups.find((g) => g.value === 'announcements').entities).toEqual(['announcements'])
    })
})
