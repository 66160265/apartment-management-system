import { describe, expect, it } from 'vitest'
import { buildRooms, roomFeatures, validateSetup } from './rooms'

describe('roomFeatures', () => {
    it('บอกชนิดห้องและเครื่องทำน้ำอุ่น', () => {
        expect(roomFeatures({ cooling: 'air', water_heater: true })).toEqual(['ห้องแอร์', 'มีเครื่องทำน้ำอุ่น'])
        expect(roomFeatures({ cooling: 'fan', water_heater: false })).toEqual(['ห้องพัดลม', 'ไม่มีเครื่องทำน้ำอุ่น'])
    })

    it('ห้องที่ยังไม่มีค่า (ก่อนรัน migration) = ห้องพัดลม ไม่มีเครื่องทำน้ำอุ่น', () => {
        expect(roomFeatures({})).toEqual(['ห้องพัดลม', 'ไม่มีเครื่องทำน้ำอุ่น'])
    })
})

describe('buildRooms', () => {
    it('4 ชั้น ชั้นละ 5 ห้อง ได้ 20 ห้องเลขเดียวกับชุดเริ่มต้นเดิม', () => {
        const rooms = buildRooms({ floors: 4, perFloor: 5, rent: 4500 })
        expect(rooms).toHaveLength(20)
        expect(rooms.map((r) => r.number)).toEqual([
            '101', '102', '103', '104', '105', '201', '202', '203', '204', '205',
            '301', '302', '303', '304', '305', '401', '402', '403', '404', '405',
        ])
        expect(rooms[0]).toEqual({ number: '101', floor: 1, status: 'vacant', rent: 4500 })
    })

    it('ห้องต่อชั้นเกิน 9 ยังเรียงลำดับ 2 หลักและไม่ซ้ำกัน', () => {
        const rooms = buildRooms({ floors: 2, perFloor: 12, rent: '3000' })
        expect(rooms.map((r) => r.number).slice(8, 14)).toEqual(['109', '110', '111', '112', '201', '202'])
        expect(new Set(rooms.map((r) => r.number)).size).toBe(24)
        expect(rooms[0].rent).toBe(3000)
    })

    it('ชั้นสูงสุดและห้องต่อชั้นสูงสุดเลขห้องไม่ชนกัน', () => {
        const numbers = buildRooms({ floors: 30, perFloor: 50, rent: 0 }).map((r) => r.number)
        expect(new Set(numbers).size).toBe(1500)
    })
})

describe('validateSetup', () => {
    it('ค่าถูกต้อง = ไม่มี error (ค่าเช่า 0 ได้)', () => {
        expect(validateSetup({ floors: '4', perFloor: '5', rent: '4500' })).toBe('')
        expect(validateSetup({ floors: 1, perFloor: 1, rent: 0 })).toBe('')
    })

    it('ชั้นและห้องต่อชั้นต้องเป็นจำนวนเต็มในช่วงที่กำหนด', () => {
        expect(validateSetup({ floors: 0, perFloor: 5, rent: 1 })).toMatch(/จำนวนชั้น/)
        expect(validateSetup({ floors: 31, perFloor: 5, rent: 1 })).toMatch(/จำนวนชั้น/)
        expect(validateSetup({ floors: 2.5, perFloor: 5, rent: 1 })).toMatch(/จำนวนชั้น/)
        expect(validateSetup({ floors: '', perFloor: 5, rent: 1 })).toMatch(/จำนวนชั้น/)
        expect(validateSetup({ floors: 4, perFloor: 0, rent: 1 })).toMatch(/ห้องต่อชั้น/)
        expect(validateSetup({ floors: 4, perFloor: 51, rent: 1 })).toMatch(/ห้องต่อชั้น/)
        expect(validateSetup({ floors: 4, perFloor: '', rent: 1 })).toMatch(/ห้องต่อชั้น/)
    })

    it('ค่าเช่าว่างหรือติดลบหรือไม่ใช่ตัวเลขไม่ผ่าน', () => {
        expect(validateSetup({ floors: 4, perFloor: 5, rent: '' })).toMatch(/ค่าเช่า/)
        expect(validateSetup({ floors: 4, perFloor: 5, rent: -1 })).toMatch(/ค่าเช่า/)
        expect(validateSetup({ floors: 4, perFloor: 5, rent: 'abc' })).toMatch(/ค่าเช่า/)
    })
})
