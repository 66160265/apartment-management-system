import { describe, expect, it } from 'vitest'
import { formatPromptPayId, generatePromptPayPayload, isValidPromptPayId } from './promptpay'

// CRC-16/CCITT-FALSE เขียนแยกไว้ในเทสต์ เพื่อเทียบกับตัวที่ใช้จริง (ค่ามาตรฐานของ "123456789" คือ 29B1)
function crc16(text) {
    let crc = 0xffff
    for (const ch of text) {
        crc ^= ch.charCodeAt(0) << 8
        for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
    return crc.toString(16).toUpperCase().padStart(4, '0')
}

describe('เทสต์ crc16 ในไฟล์นี้', () => {
    it('ตรงกับค่ามาตรฐาน', () => {
        expect(crc16('123456789')).toBe('29B1')
    })
})

describe('isValidPromptPayId', () => {
    it.each([
        ['0812345678', true],
        ['081-234-5678', true],
        ['1234567890123', true],
        ['1-2345-67890-12-3', true],
        ['', false],
        [undefined, false],
        ['812345678', false],
        ['1812345678', false],
        ['12345678901', false],
    ])('%s -> %s', (value, expected) => {
        expect(isValidPromptPayId(value)).toBe(expected)
    })
})

describe('formatPromptPayId', () => {
    it('จัดรูปเบอร์มือถือ', () => {
        expect(formatPromptPayId('0812345678')).toBe('081-234-5678')
    })
    it('จัดรูปเลขบัตร 13 หลัก', () => {
        expect(formatPromptPayId('1234567890123')).toBe('1-2345-67890-12-3')
    })
    it('ค่าที่ไม่ถูกต้องคืนตามเดิม', () => {
        expect(formatPromptPayId('123')).toBe('123')
    })
})

describe('generatePromptPayPayload', () => {
    it('คืนค่าว่างเมื่อรหัสพร้อมเพย์ไม่ถูกต้อง หรือยังไม่ได้ตั้งค่า', () => {
        expect(generatePromptPayPayload('')).toBe('')
        expect(generatePromptPayPayload('123')).toBe('')
    })

    it('เบอร์มือถือ: ใช้รหัสประเทศ 0066 ตัด 0 นำหน้า และระบุยอดเป็น QR แบบ dynamic', () => {
        const p = generatePromptPayPayload('0812345678', 4531)
        expect(p.startsWith('000201010212')).toBe(true)
        expect(p).toContain('0016A000000677010111')
        expect(p).toContain('01130066812345678')
        expect(p).toContain('5802TH')
        expect(p).toContain('5303764')
        expect(p).toContain('54074531.00')
    })

    it('เลขบัตร 13 หลัก: ใช้ประเภท 02', () => {
        expect(generatePromptPayPayload('1234567890123', 100)).toContain('02131234567890123')
    })

    it('ไม่ระบุยอด: เป็น QR แบบ static และไม่มีฟิลด์ยอด', () => {
        const p = generatePromptPayPayload('0812345678')
        expect(p.startsWith('000201010211')).toBe(true)
        expect(p).not.toContain('5303764' + '54')
    })

    it('CRC ท้าย payload ถูกต้อง', () => {
        for (const amount of [undefined, 1, 4531, 12345.5]) {
            const p = generatePromptPayPayload('0812345678', amount)
            expect(p.slice(-8, -4)).toBe('6304')
            expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)))
        }
    })

    it('ยอดมีทศนิยม 2 ตำแหน่งเสมอ', () => {
        expect(generatePromptPayPayload('0812345678', 12345.5)).toContain('540812345.50')
    })
})
