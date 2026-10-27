import { describe, expect, it } from 'vitest'
import { emptyForm, needsAction, needsNewTime, repairSubmitFields, validateRepairSubmit } from './userRepairs'

describe('needsNewTime', () => {
    it('รอดำเนินการและไม่มีช่วงเวลาที่เลือกไว้ ไม่อนุญาตเข้าห้อง = ต้องเลือกใหม่', () => {
        expect(needsNewTime({ status: 'pending', available_slots: [], allow_entry: false })).toBe(true)
        expect(needsNewTime({ status: 'pending', available_slots: null, allow_entry: false })).toBe(true)
    })

    it('มีช่วงเวลา หรืออนุญาตเข้าห้อง หรือไม่ใช่รอดำเนินการ = ไม่ต้อง', () => {
        expect(needsNewTime({ status: 'pending', available_slots: [{ date: '2026-10-25', period: '09:00-10:00' }], allow_entry: false })).toBe(false)
        expect(needsNewTime({ status: 'pending', available_slots: [], allow_entry: true })).toBe(false)
        expect(needsNewTime({ status: 'in_progress', available_slots: [], allow_entry: false })).toBe(false)
    })
})

describe('needsAction', () => {
    it('ผู้ดูแลเสนอนัด หรือซ่อมเสร็จแต่ผู้เช่ายังไม่ยืนยัน = ต้องทำต่อ', () => {
        expect(needsAction({ status: 'in_progress', appointment_state: 'proposed' })).toBe(true)
        expect(needsAction({ status: 'done', tenant_confirmed_at: null })).toBe(true)
    })

    it('นัดยืนยันแล้ว หรือผู้เช่ายืนยันผลแล้ว = ไม่ต้อง', () => {
        expect(needsAction({ status: 'in_progress', appointment_state: 'confirmed' })).toBe(false)
        expect(needsAction({ status: 'done', tenant_confirmed_at: '2026-10-20T10:00:00Z' })).toBe(false)
        expect(needsAction({ status: 'pending' })).toBe(false)
    })
})

describe('validateRepairSubmit', () => {
    const ok = { ...emptyForm, category: 'plumbing', problem: 'ก๊อกน้ำรั่ว', allow_entry: true }

    it('ต้องเลือกประเภทและระบุปัญหาก่อน', () => {
        expect(validateRepairSubmit({ ...ok, category: '' })).toBe('กรุณาเลือกประเภทงานซ่อม')
        expect(validateRepairSubmit({ ...ok, problem: '  ' })).toBe('กรุณาระบุปัญหาที่พบ')
    })

    it('ไม่เลือกช่วงเวลาและไม่อนุญาตให้เข้าห้อง = ไม่ผ่าน', () => {
        expect(validateRepairSubmit({ ...ok, allow_entry: false, slots: [] })).not.toBe('')
    })

    it('อนุญาตให้ช่างเข้าห้องได้ = ผ่านโดยไม่ต้องเลือกช่วงเวลา', () => {
        expect(validateRepairSubmit(ok)).toBe('')
    })
})

describe('repairSubmitFields', () => {
    it('ตัดช่องว่างหัวท้าย และส่งรูปที่ใช้', () => {
        expect(repairSubmitFields({ ...emptyForm, problem: ' ก๊อก ', detail: ' น้ำหยด ', category: 'plumbing', allow_entry: true, slots: [] }, 'u/1.jpg')).toEqual({
            problem: 'ก๊อก', detail: 'น้ำหยด', image_path: 'u/1.jpg', category: 'plumbing', allow_entry: true, available_slots: [],
        })
    })
})
