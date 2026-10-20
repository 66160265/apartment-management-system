import { describe, expect, it } from 'vitest'
import { evaluateSlip, mapEasySlipError, parseEasySlip } from './evaluate'

const now = new Date('2026-10-20T10:00:00+07:00')
const ctx = { balance: 1000, invoiceCreatedAt: '2026-10-01T09:00:00+07:00', now }

// โครงสร้างคำตอบตามเอกสาร EasySlip v2 (rawSlip.amount.amount, sender/receiver.account.name.th ฯลฯ)
const response = (over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  success: true,
  message: 'Bank slip verified successfully',
  data: {
    isDuplicate: false,
    rawSlip: {
      payload: 'xxx',
      transRef: 'TR123456',
      date: '2026-10-18T14:30:00+07:00',
      amount: { amount: 1000 },
      sender: { bank: { id: '004', name: 'กสิกรไทย', short: 'KBANK' }, account: { name: { th: 'นายทดสอบ ใจดี' } } },
      receiver: { bank: { id: '014', name: 'ไทยพาณิชย์', short: 'SCB' }, account: { name: { th: 'หอพักสุขสันต์' } } },
      ...over,
    },
    ...data,
  },
})

describe('parseEasySlip', () => {
  it('อ่านยอด วันที่ เลขอ้างอิง ผู้โอน ผู้รับ', () => {
    expect(parseEasySlip(response())).toEqual({
      amount: 1000,
      date: '2026-10-18T14:30:00+07:00',
      transRef: 'TR123456',
      senderName: 'นายทดสอบ ใจดี',
      receiverName: 'หอพักสุขสันต์',
      accountMatched: null,
    })
  })

  it('อ่านยอดได้ทั้งแบบออบเจ็กต์และตัวเลขตรง ๆ', () => {
    expect(parseEasySlip(response({ amount: 250.5 })).amount).toBe(250.5)
  })

  it('คำตอบว่างหรือโครงสร้างผิด ไม่ throw แต่ได้ค่า null', () => {
    for (const body of [null, undefined, {}, { data: {} }, { data: { rawSlip: {} } }]) {
      expect(parseEasySlip(body)).toEqual({ amount: null, date: null, transRef: null, senderName: null, receiverName: null, accountMatched: null })
    }
  })

  it('อ่านผลการจับคู่บัญชีเมื่อมี matchedAccount', () => {
    expect(parseEasySlip(response({}, { matchedAccount: { nameTh: 'x' } })).accountMatched).toBe(true)
    expect(parseEasySlip(response({}, { matchedAccount: null })).accountMatched).toBe(false)
  })
})

describe('evaluateSlip', () => {
  it('ยอดตรงทุกอย่างปกติ = ok และไม่มีหมายเหตุ', () => {
    const v = evaluateSlip(parseEasySlip(response()), ctx)
    expect(v.status).toBe('ok')
    expect(v.detail.notes).toEqual([])
    expect(v.detail.amount).toBe(1000)
    expect(v.detail.transRef).toBe('TR123456')
  })

  it('ยอดน้อยกว่าคงเหลือ = warn บอกยอดที่ขาด', () => {
    const v = evaluateSlip(parseEasySlip(response({ amount: { amount: 600 } })), ctx)
    expect(v.status).toBe('warn')
    expect((v.detail.notes as string[])[0]).toContain('ขาด ฿400')
  })

  it('ยอดมากกว่าคงเหลือ = warn บอกยอดที่เกิน', () => {
    const v = evaluateSlip(parseEasySlip(response({ amount: { amount: 1200 } })), ctx)
    expect(v.status).toBe('warn')
    expect((v.detail.notes as string[])[0]).toContain('เกิน ฿200')
  })

  it('เศษสตางค์ไม่ทำให้ยอดพอดีกลายเป็นไม่ตรง', () => {
    const v = evaluateSlip(parseEasySlip(response({ amount: { amount: 0.1 + 0.2 } })), { ...ctx, balance: 0.3 })
    expect(v.status).toBe('ok')
  })

  it('อ่านยอดไม่ได้ = warn', () => {
    expect(evaluateSlip(parseEasySlip(response({ amount: undefined })), ctx).status).toBe('warn')
  })

  it('วันที่โอนอยู่ในอนาคต = warn', () => {
    const v = evaluateSlip(parseEasySlip(response({ date: '2026-10-25T10:00:00+07:00' })), ctx)
    expect(v.status).toBe('warn')
    expect((v.detail.notes as string[]).join()).toContain('อนาคต')
  })

  it('วันที่โอนเก่ากว่าวันออกบิลเกิน 1 วัน = warn แต่ก่อนไม่เกิน 1 วันยังผ่าน', () => {
    expect(evaluateSlip(parseEasySlip(response({ date: '2026-09-20T10:00:00+07:00' })), ctx).status).toBe('warn')
    expect(evaluateSlip(parseEasySlip(response({ date: '2026-09-30T20:00:00+07:00' })), ctx).status).toBe('ok')
  })

  it('ผู้รับไม่ตรงบัญชีหอพัก = warn', () => {
    const v = evaluateSlip(parseEasySlip(response({}, { matchedAccount: null })), ctx)
    expect(v.status).toBe('warn')
    expect((v.detail.notes as string[]).join()).toContain('ผู้รับ')
  })

  it('ไม่มีเลขอ้างอิง = warn (ตรวจสลิปซ้ำไม่ได้)', () => {
    expect(evaluateSlip(parseEasySlip(response({ transRef: undefined })), ctx).status).toBe('warn')
  })

  it('ไม่เคยให้ผล failed จากการประเมินยอด (สลิปจริงเสมอ ปฏิเสธเป็นหน้าที่แอดมิน)', () => {
    for (const amount of [1, 999.99, 1000.01, 99999]) {
      expect(evaluateSlip(parseEasySlip(response({ amount: { amount } })), ctx).status).not.toBe('failed')
    }
  })
})

describe('mapEasySlipError', () => {
  it('ไม่พบ QR = failed', () => {
    expect(mapEasySlipError('SLIP_NOT_FOUND').status).toBe('failed')
  })

  it('ปัญหาของบริการ/โควตา/ธนาคารกรุงเทพยังไม่พร้อม = error (ตรวจใหม่ได้ ไม่ตัดสินว่าสลิปผิด)', () => {
    for (const code of ['SLIP_PENDING', 'QUOTA_EXCEEDED', 'RATE_LIMIT_EXCEEDED', 'INVALID_API_KEY', 'API_SERVER_ERROR', undefined]) {
      expect(mapEasySlipError(code).status).toBe('error')
    }
  })

  it('ข้อความทุกกรณีเป็นภาษาไทยและไม่เปิดเผยคีย์', () => {
    for (const code of ['INVALID_API_KEY', 'MISSING_API_KEY', 'QUOTA_EXCEEDED']) {
      const notes = mapEasySlipError(code).detail.notes as string[]
      expect(notes.length).toBeGreaterThan(0)
      expect(notes.join()).not.toMatch(/Bearer|api[_ ]?key/i)
    }
  })
})
