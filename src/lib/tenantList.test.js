import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { byRoom, countRequiredDocs, docsComplete, filterTenants, fromRow, tabCounts } from './tenantList'

// ตรึงเวลาเป็น 20 ต.ค. 2026 เที่ยงวัน (เวลาท้องถิ่น)
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
})
afterEach(() => vi.useRealTimers())

const t = (room, over = {}) => ({ room, name: `ผู้เช่า${room}`, phone: '081-234-5678', endDate: '2027-12-31', ...over })

describe('fromRow', () => {
    it('แปลงชื่อ field และเงินประกันที่ไม่มีค่า = 0', () => {
        expect(fromRow({ room: '101', name: 'ก', phone: '0812345678', username: 'T101', start_date: '2026-01-01', end_date: '2026-12-31', user_id: 'u1' })).toEqual({
            room: '101', name: 'ก', phone: '0812345678', username: 'T101', startDate: '2026-01-01', endDate: '2026-12-31', userId: 'u1', deposit: 0,
        })
        expect(fromRow({ room: '101', deposit: '3000' }).deposit).toBe(3000)
    })
})

describe('byRoom', () => {
    it('เรียงเลขห้องแบบตัวเลข', () => {
        expect([t('1001'), t('201'), t('101')].sort(byRoom).map((x) => x.room)).toEqual(['101', '201', '1001'])
    })
})

describe('countRequiredDocs / docsComplete', () => {
    const docs = [
        { room: '101', type: 'id_card' }, { room: '101', type: 'contract' }, { room: '101', type: 'deposit_slip' },
        { room: '102', type: 'id_card' }, { room: '102', type: 'other' },
    ]

    it('นับเฉพาะเอกสารหลักต่อห้อง และไม่พังเมื่อไม่มีข้อมูล', () => {
        expect(countRequiredDocs(docs)).toEqual({ 101: 3, 102: 1 })
        expect(countRequiredDocs(null)).toEqual({})
    })

    it('ครบเมื่อมีทุกประเภท', () => {
        const counts = countRequiredDocs(docs)
        expect(docsComplete(counts, t('101'))).toBe(true)
        expect(docsComplete(counts, t('102'))).toBe(false)
        expect(docsComplete(counts, t('103'))).toBe(false)
    })
})

describe('tabCounts / filterTenants', () => {
    const tenants = [
        t('101'),
        t('102', { endDate: '2026-10-30' }),
        t('103', { endDate: '2026-09-01', phone: '099-999-0000' }),
    ]
    const docCounts = { 101: 3, 102: 3 }

    it('นับตามแท็บ', () => {
        expect(tabCounts(tenants, docCounts)).toEqual({ all: 3, expiring: 1, expired: 1, docs: 1 })
    })

    it('กรองตามแท็บ', () => {
        expect(filterTenants(tenants, { tab: 'expiring', search: '', docCounts }).map((x) => x.room)).toEqual(['102'])
        expect(filterTenants(tenants, { tab: 'expired', search: '', docCounts }).map((x) => x.room)).toEqual(['103'])
        expect(filterTenants(tenants, { tab: 'docs', search: '', docCounts }).map((x) => x.room)).toEqual(['103'])
    })

    it('ค้นหาจากชื่อ เลขห้อง และเบอร์โทร (เทียบเฉพาะตัวเลข)', () => {
        expect(filterTenants(tenants, { tab: 'all', search: ' ผู้เช่า102 ', docCounts }).map((x) => x.room)).toEqual(['102'])
        expect(filterTenants(tenants, { tab: 'all', search: '103', docCounts }).map((x) => x.room)).toEqual(['103'])
        expect(filterTenants(tenants, { tab: 'all', search: '999 990', docCounts }).map((x) => x.room)).toEqual(['103'])
        expect(filterTenants(tenants, { tab: 'all', search: 'ไม่มีชื่อนี้', docCounts })).toEqual([])
    })
})
