import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: () => {} } } }))

const { MAX_MESSAGE_LENGTH, validateChatImage } = await import('./chat')

describe('validateChatImage', () => {
    it('รับ JPG/PNG/WEBP ไม่เกิน 5 MB', () => {
        expect(validateChatImage({ type: 'image/jpeg', size: 1024 })).toBe('')
        expect(validateChatImage({ type: 'image/png', size: 5 * 1024 * 1024 })).toBe('')
        expect(validateChatImage({ type: 'image/webp', size: 1 })).toBe('')
    })

    it('ไม่รับชนิดอื่น (เช่น PDF, GIF) และไฟล์ที่ใหญ่เกิน', () => {
        expect(validateChatImage({ type: 'application/pdf', size: 1024 })).toContain('JPG, PNG หรือ WEBP')
        expect(validateChatImage({ type: 'image/gif', size: 1024 })).toContain('JPG, PNG หรือ WEBP')
        expect(validateChatImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toContain('5 MB')
    })
})

describe('MAX_MESSAGE_LENGTH', () => {
    it('จำกัดข้อความ 2000 ตัวอักษร (ตรงกับ constraint ในฐานข้อมูล)', () => {
        expect(MAX_MESSAGE_LENGTH).toBe(2000)
    })
})
