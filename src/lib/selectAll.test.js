import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, selectAll } from './selectAll'

// query จำลอง: ตารางที่มี total แถว ตอบตามช่วงที่ขอด้วย .range
const fakeQuery = (total, calls = []) => () => ({
    range: (from, to) => {
        calls.push([from, to])
        const rows = Array.from({ length: Math.max(0, Math.min(total, to + 1) - from) }, (_, i) => ({ id: from + i }))
        return Promise.resolve({ data: rows, error: null })
    },
})

describe('selectAll', () => {
    it('ตารางเล็ก: ดึงครั้งเดียว', async () => {
        const calls = []
        const { data, error } = await selectAll(fakeQuery(3, calls))
        expect(error).toBeNull()
        expect(data).toHaveLength(3)
        expect(calls).toEqual([[0, PAGE_SIZE - 1]])
    })

    it('เกิน 1,000 แถว: ดึงทีละหน้าจนครบ ไม่ตัดทิ้ง และไม่ซ้ำ', async () => {
        const calls = []
        const { data } = await selectAll(fakeQuery(2500, calls))
        expect(data).toHaveLength(2500)
        expect(new Set(data.map((r) => r.id)).size).toBe(2500)
        expect(calls).toHaveLength(3)
    })

    it('พอดีเต็มหน้า: ลองหน้าถัดไปอีกหนึ่งครั้งแล้วจบ', async () => {
        const calls = []
        const { data } = await selectAll(fakeQuery(PAGE_SIZE, calls))
        expect(data).toHaveLength(PAGE_SIZE)
        expect(calls).toHaveLength(2)
    })

    it('หน้าไหน error: คืน error ไม่คืนข้อมูลครึ่ง ๆ กลาง ๆ', async () => {
        let n = 0
        const { data, error } = await selectAll(() => ({
            range: () => Promise.resolve(++n === 1 ? { data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), error: null } : { data: null, error: { message: 'boom' } }),
        }))
        expect(data).toBeNull()
        expect(error.message).toBe('boom')
    })
})
