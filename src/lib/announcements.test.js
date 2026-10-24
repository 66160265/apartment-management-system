import { describe, expect, it, vi } from 'vitest'

const ops = []
let result = { data: [], error: null, count: 0 }
vi.mock('./supabaseClient', () => ({
    supabase: {
        from: (table) => {
            const op = { table, calls: [] }
            const rec = (name) => (...args) => { op.calls.push([name, ...args]); return b }
            const b = {
                select: rec('select'), order: rec('order'), limit: rec('limit'), not: rec('not'), eq: rec('eq'),
                insert: (v) => { op.insert = v; return b },
                update: (v) => { op.update = v; return b },
                delete: () => { op.delete = true; return b },
                then: (resolve, reject) => { ops.push(op); return Promise.resolve(result).then(resolve, reject) },
            }
            return b
        },
    },
}))

const { TITLE_MAX, BODY_MAX, validateAnnouncement, loadAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, countRecipients, isRecent } = await import('./announcements')

describe('validateAnnouncement', () => {
    it('ผ่านเมื่อมีหัวข้อ (เนื้อหาว่างได้)', () => {
        expect(validateAnnouncement({ title: 'งดน้ำ', body: '' })).toBe('')
        expect(validateAnnouncement({ title: 'งดน้ำ' })).toBe('')
    })
    it('หัวข้อว่างหรือมีแต่ช่องว่าง = error', () => {
        expect(validateAnnouncement({ title: '', body: 'x' })).toContain('หัวข้อ')
        expect(validateAnnouncement({ title: '   ', body: 'x' })).toContain('หัวข้อ')
        expect(validateAnnouncement({ title: undefined })).toContain('หัวข้อ')
    })
    it('ยาวเกินกำหนด = error ตรงขอบผ่าน', () => {
        expect(validateAnnouncement({ title: 'ก'.repeat(TITLE_MAX) })).toBe('')
        expect(validateAnnouncement({ title: 'ก'.repeat(TITLE_MAX + 1) })).toContain('หัวข้อยาวเกินไป')
        expect(validateAnnouncement({ title: 'x', body: 'ก'.repeat(BODY_MAX) })).toBe('')
        expect(validateAnnouncement({ title: 'x', body: 'ก'.repeat(BODY_MAX + 1) })).toContain('เนื้อหายาวเกินไป')
    })
})

describe('การเรียกฐานข้อมูล', () => {
    it('loadAnnouncements: ใหม่ไปเก่า จำกัดจำนวน คืนรายการ', async () => {
        result = { data: [{ id: 'a' }], error: null }
        expect(await loadAnnouncements(5)).toEqual([{ id: 'a' }])
        const op = ops.at(-1)
        expect(op.table).toBe('announcements')
        expect(op.calls).toContainEqual(['order', 'created_at', { ascending: false }])
        expect(op.calls).toContainEqual(['limit', 5])
    })

    it('loadAnnouncements: ยังไม่มีตาราง = null ไม่ throw', async () => {
        result = { data: null, error: { message: 'relation does not exist' } }
        expect(await loadAnnouncements()).toBeNull()
    })

    it('createAnnouncement: ตัดช่องว่าง ส่งเฉพาะ title/body/important (ผู้เขียนและเวลาให้ฐานข้อมูลกำหนด) สำเร็จคืน null', async () => {
        result = { data: null, error: null }
        expect(await createAnnouncement({ title: '  งดน้ำ  ', body: '  พรุ่งนี้  ', important: 1 })).toBeNull()
        expect(ops.at(-1).insert).toEqual({ title: 'งดน้ำ', body: 'พรุ่งนี้', important: true })
    })

    it('createAnnouncement: ไม่ผ่านการตรวจ ไม่ยิงฐานข้อมูล', async () => {
        const before = ops.length
        expect(await createAnnouncement({ title: '  ', body: '' })).toContain('หัวข้อ')
        expect(ops).toHaveLength(before)
    })

    it('createAnnouncement: ฐานข้อมูลปฏิเสธ คืนข้อความ', async () => {
        result = { data: null, error: { message: 'new row violates row-level security policy' } }
        expect(await createAnnouncement({ title: 'x', body: '' })).toContain('row-level security')
    })

    it('updateAnnouncement แก้เฉพาะแถวนั้น / deleteAnnouncement ลบเฉพาะแถวนั้น', async () => {
        result = { data: null, error: null }
        expect(await updateAnnouncement('a1', { title: ' ใหม่ ', body: '', important: false })).toBeNull()
        expect(ops.at(-1).update).toEqual({ title: 'ใหม่', body: '', important: false })
        expect(ops.at(-1).calls).toContainEqual(['eq', 'id', 'a1'])
        expect(await deleteAnnouncement('a1')).toBeNull()
        expect(ops.at(-1).delete).toBe(true)
        expect(ops.at(-1).calls).toContainEqual(['eq', 'id', 'a1'])
    })

    it('countRecipients: นับเฉพาะผู้เช่าที่มีบัญชี ไม่ได้ = null', async () => {
        result = { count: 3, error: null }
        expect(await countRecipients()).toBe(3)
        expect(ops.at(-1).calls).toContainEqual(['not', 'user_id', 'is', null])
        result = { count: null, error: { message: 'x' } }
        expect(await countRecipients()).toBeNull()
    })
})

describe('isRecent', () => {
    const now = new Date('2026-10-23T00:00:00Z')
    it('ภายในกี่วัน', () => {
        expect(isRecent('2026-10-20T00:00:00Z', 14, now)).toBe(true)
        expect(isRecent('2026-10-09T00:00:00Z', 14, now)).toBe(true)
        expect(isRecent('2026-10-08T23:00:00Z', 14, now)).toBe(false)
        expect(isRecent('ไม่ใช่วันที่', 14, now)).toBe(false)
    })
})
