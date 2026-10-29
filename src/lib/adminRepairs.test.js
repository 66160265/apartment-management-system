import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { costOf, emptyForm, formFromRepair, lockedSlotsOf, repairFields, validateRepairForm } from './adminRepairs'

// ตรึงเวลาเป็น 20 ต.ค. 2026 เที่ยงวัน (เวลาท้องถิ่น) ให้ "วันนี้" คงที่
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
})
afterEach(() => vi.useRealTimers())

const form = (over = {}) => ({ ...emptyForm, room: '101', problem: 'หลอดไฟขาด', ...over })
const tenantRepair = (over = {}) => ({ id: 'r1', user_id: 'u1', status: 'pending', available_slots: [], appointment_date: null, appointment_period: null, ...over })

describe('validateRepairForm', () => {
    it('ฟอร์มใหม่ที่กรอกครบ = ผ่าน', () => {
        expect(validateRepairForm({ form: form(), editing: 'new', slotChoices: [] })).toBe('')
    })

    it('ต้องเลือกห้องและระบุปัญหา', () => {
        expect(validateRepairForm({ form: form({ room: '' }), editing: 'new', slotChoices: [] })).toBe('กรุณาเลือกห้อง')
        expect(validateRepairForm({ form: form({ problem: '   ' }), editing: 'new', slotChoices: [] })).toBe('กรุณาระบุปัญหา')
    })

    it('เรื่องที่กำลังดำเนินการ ย้อนกลับเป็นรอดำเนินการไม่ได้', () => {
        const editing = tenantRepair({ status: 'in_progress' })
        expect(validateRepairForm({ form: form({ status: 'pending' }), editing, slotChoices: [] })).toMatch(/เปลี่ยนกลับ/)
    })

    it('รอดำเนินการ ข้ามไปเสร็จสิ้นเลยไม่ได้ ต้องกำลังดำเนินการก่อน', () => {
        expect(validateRepairForm({ form: form({ status: 'done' }), editing: tenantRepair(), slotChoices: [] })).toMatch(/กำลังดำเนินการ/)
        expect(validateRepairForm({ form: form({ status: 'done' }), editing: 'new', slotChoices: [] })).toMatch(/กำลังดำเนินการ/)
        expect(validateRepairForm({ form: form({ status: 'done' }), editing: tenantRepair({ status: 'in_progress' }), slotChoices: [] })).toBe('')
    })

    it('กำลังดำเนินการต้องมีชื่อและเบอร์ช่าง', () => {
        expect(validateRepairForm({ form: form({ status: 'in_progress' }), editing: 'new', slotChoices: [] })).not.toBe('')
        expect(validateRepairForm({ form: form({ status: 'in_progress', technician: 'ช่างสมชาย', technician_phone: '0812345678' }), editing: 'new', slotChoices: [] })).toBe('')
    })

    it('เปลี่ยนเป็นกำลังดำเนินการโดยไม่เลือกวันนัดจากช่วงที่ผู้เช่าส่งมา: บอกให้เลือก หรือให้ผู้เช่าเลือกใหม่ถ้าทุกช่วงผ่านไปแล้ว', () => {
        const editing = tenantRepair({ available_slots: [{ date: '2026-10-25', period: '09:00-10:00' }] })
        const f = form({ status: 'in_progress', technician: 'ช่าง', technician_phone: '0812345678' })
        expect(validateRepairForm({ form: f, editing, slotChoices: [{ date: '2026-10-25', period: '09:00-10:00' }] })).toMatch(/เลือกวันเวลานัด/)
        expect(validateRepairForm({ form: f, editing, slotChoices: [] })).toMatch(/ผ่านไปแล้ว/)
    })

    it('วันนัดที่ผ่านไปแล้วไม่ผ่าน', () => {
        const f = form({ status: 'in_progress', technician: 'ช่าง', technician_phone: '0812345678', appointment_date: '2026-10-01', appointment_period: '09:00-10:00' })
        expect(validateRepairForm({ form: f, editing: 'new', slotChoices: [] })).toMatch(/ผ่านไปแล้ว/)
    })

    it('ค่าใช้จ่ายติดลบไม่ผ่าน', () => {
        expect(validateRepairForm({ form: form({ cost: '-5' }), editing: 'new', slotChoices: [] })).toMatch(/ค่าใช้จ่าย/)
    })
})

describe('costOf', () => {
    it('ช่องว่าง = 0', () => {
        expect(costOf({ cost: '' })).toBe(0)
        expect(costOf({ cost: '150.5' })).toBe(150.5)
    })
})

describe('formFromRepair', () => {
    it('เติมค่าเดิม และใช้ค่าเริ่มต้นเมื่อไม่มีค่า', () => {
        const f = formFromRepair({ room: '101', problem: 'ก๊อกน้ำ', detail: '', status: 'pending', admin_note: '', cost: 0, appointment_state: 'confirmed' })
        expect(f).toMatchObject({ room: '101', category: 'other', cost: '', cost_payer: 'owner', confirmed: true, pinned: false })
    })
})

describe('lockedSlotsOf', () => {
    it('ยังไม่มีวันนัด หรือสถานะยังไม่ถึง = null', () => {
        expect(lockedSlotsOf(null)).toBeNull()
        expect(lockedSlotsOf('new')).toBeNull()
        expect(lockedSlotsOf(tenantRepair({ status: 'pending', appointment_date: '2026-10-25' }))).toBeNull()
        expect(lockedSlotsOf(tenantRepair({ status: 'in_progress' }))).toBeNull()
    })

    it('วันนัดไม่อยู่ในช่วงที่ผู้เช่าส่งมา (ข้อมูลเก่า) = เพิ่มต่อท้ายเป็นช่วงที่เลือก', () => {
        const list = lockedSlotsOf(tenantRepair({
            status: 'in_progress',
            appointment_date: '2026-10-26',
            appointment_period: '14:00-15:00',
            available_slots: [{ date: '2026-10-25', period: '09:00-10:00' }],
        }))
        expect(list).toHaveLength(2)
        expect(list[0].chosen).toBe(false)
        expect(list[1]).toMatchObject({ date: '2026-10-26', period: '14:00-15:00', chosen: true })
    })
})

describe('repairFields', () => {
    it('รายการใหม่ของห้องว่าง: หอพักจ่าย และนัดยืนยันเลยเพราะไม่มีผู้เช่า', () => {
        const f = repairFields({
            form: form({ status: 'in_progress', technician: ' ช่าง ', technician_phone: '0812345678', appointment_date: '2026-10-25', appointment_period: '09:00-10:00', cost_payer: 'tenant' }),
            editing: 'new', tenant: undefined, imagePath: null, askNewTime: false,
        })
        expect(f).toMatchObject({ cost_payer: 'owner', appointment_state: 'confirmed', technician: 'ช่าง', problem: 'หลอดไฟขาด', image_path: null })
    })

    it('เรื่องที่ผู้เช่าแจ้ง: ไม่ส่งปัญหา รายละเอียด รูป และนัดนอกช่วงที่เลือกต้องรอผู้เช่ายืนยัน', () => {
        const editing = tenantRepair({ available_slots: [{ date: '2026-10-25', period: '09:00-10:00' }] })
        const f = repairFields({
            form: form({ status: 'in_progress', appointment_date: '2026-10-27', appointment_period: '10:00-11:00', cost_payer: 'tenant' }),
            editing, tenant: undefined, imagePath: 'x.jpg', askNewTime: false,
        })
        expect(f).not.toHaveProperty('problem')
        expect(f).not.toHaveProperty('detail')
        expect(f).not.toHaveProperty('image_path')
        expect(f.appointment_state).toBe('proposed')
        expect(f.cost_payer).toBe('tenant')
    })

    it('ให้ผู้เช่าเลือกเวลาใหม่: ล้างช่วงที่เลือกไว้ และเสร็จสิ้นแล้วเลิกปักหมุด', () => {
        const f = repairFields({ form: form({ status: 'done', pinned: true }), editing: tenantRepair(), tenant: undefined, imagePath: null, askNewTime: true })
        expect(f).toMatchObject({ available_slots: [], allow_entry: false, pinned: false })
    })
})
