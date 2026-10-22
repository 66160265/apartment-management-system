// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ฐานข้อมูลจำลอง: แถวแจ้งเตือน และบันทึกคำสั่งที่เรียก
let rows
let userId
let failWrites
const log = []
let authCallback

const loadResult = () => ({ data: rows.map((r) => ({ ...r })), error: null })

vi.mock('./supabaseClient', () => ({
    supabase: {
        auth: { onAuthStateChange: (cb) => { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } } } },
        channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch },
        removeChannel: () => {},
        from: () => {
            const q = { op: 'select', filters: [] }
            const run = () => {
                log.push({ op: q.op, patch: q.patch, filters: q.filters })
                if (q.op === 'select') return Promise.resolve(loadResult())
                return Promise.resolve(failWrites ? { error: { message: 'boom' } } : { error: null })
            }
            const b = {
                select: () => b,
                order: () => b,
                limit: () => b,
                eq: (c, v) => { q.filters.push(`${c}=${v}`); return b },
                is: (c, v) => { q.filters.push(`${c} is ${v}`); return b },
                not: (c, o, v) => { q.filters.push(`${c} not ${o} ${v}`); return b },
                update: (patch) => { q.op = 'update'; q.patch = patch; return b },
                delete: () => { q.op = 'delete'; return b },
                then: (resolve, reject) => run().then(resolve, reject),
            }
            return b
        },
    },
}))
vi.mock('./useCurrentUser', () => ({ useCurrentUser: () => (userId ? { id: userId } : null) }))

const note = (id, read = false) => ({ id, recipient_id: 'u1', type: 'system', title: id, read_at: read ? '2026-10-01T00:00:00Z' : null, created_at: `2026-10-0${id.slice(-1)}T00:00:00Z` })

let container
let root
let api
let latest
async function mount() {
    vi.resetModules()
    api = await import('./useNotifications')
    function Probe() {
        latest = api.useNotifications()
        return null
    }
    await act(async () => { root.render(<Probe />) })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() }) }

describe('useNotifications', () => {
    beforeEach(() => {
        rows = [note('n1'), note('n2', true), note('n3')]
        userId = 'u1'
        failWrites = false
        log.length = 0
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
    })

    it('โหลดแจ้งเตือนของผู้ใช้ และนับจำนวนที่ยังไม่อ่าน', async () => {
        await mount()
        expect(latest.loading).toBe(false)
        expect(latest.items.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
        expect(latest.unreadCount).toBe(2)
        expect(log[0]).toMatchObject({ op: 'select' })
        expect(log[0].filters).toContain('recipient_id=u1')
    })

    it('ยังไม่ login: ไม่โหลดอะไร ถือว่ากำลังโหลด', async () => {
        userId = null
        await mount()
        expect(latest.items).toEqual([])
        expect(latest.loading).toBe(true)
        expect(log).toHaveLength(0)
    })

    it('markRead: หน้าจอเปลี่ยนทันที แล้วบันทึกลงฐานข้อมูล', async () => {
        await mount()
        await act(async () => { await api.markRead('n1') })
        expect(latest.unreadCount).toBe(1)
        const update = log.find((l) => l.op === 'update')
        expect(update.filters).toContain('id=n1')
        expect(update.patch.read_at).toBeTruthy()
    })

    it('markRead ใบที่อ่านแล้ว/ไม่มีอยู่: ไม่ยิงฐานข้อมูล', async () => {
        await mount()
        await act(async () => { await api.markRead('n2'); await api.markRead('nope') })
        expect(log.filter((l) => l.op === 'update')).toHaveLength(0)
    })

    it('markAllRead: ทุกรายการอ่านแล้ว ยิงคำสั่งเดียวเฉพาะของผู้ใช้และที่ยังไม่อ่าน', async () => {
        await mount()
        await act(async () => { await api.markAllRead() })
        expect(latest.unreadCount).toBe(0)
        const update = log.find((l) => l.op === 'update')
        expect(update.filters).toEqual(['recipient_id=u1', 'read_at is null'])
    })

    it('removeNotification: ลบออกจากหน้าจอทันที', async () => {
        await mount()
        await act(async () => { await api.removeNotification('n1') })
        expect(latest.items.map((n) => n.id)).toEqual(['n2', 'n3'])
        expect(log.find((l) => l.op === 'delete').filters).toContain('id=n1')
    })

    it('clearRead: ลบเฉพาะที่อ่านแล้ว', async () => {
        await mount()
        await act(async () => { await api.clearRead() })
        expect(latest.items.map((n) => n.id)).toEqual(['n1', 'n3'])
        expect(log.find((l) => l.op === 'delete').filters).toEqual(['recipient_id=u1', 'read_at not is null'])
    })

    it('บันทึกไม่สำเร็จ: โหลดจากฐานข้อมูลใหม่ ไม่ค้างค่าที่เดาไว้', async () => {
        await mount()
        failWrites = true
        const selectsBefore = log.filter((l) => l.op === 'select').length
        await act(async () => { await api.removeNotification('n1') })
        await flush()
        expect(log.filter((l) => l.op === 'select').length).toBeGreaterThan(selectsBefore)
        expect(latest.items.map((n) => n.id)).toContain('n1')
    })

    it('ออกจากระบบ: ล้างรายการของผู้ใช้เดิมทันที ไม่ค้างให้คนถัดไปเห็น', async () => {
        await mount()
        expect(latest.items).toHaveLength(3)
        await act(async () => { authCallback('SIGNED_OUT') })
        expect(latest.items).toEqual([])
        expect(latest.unreadCount).toBe(0)
        expect(latest.loading).toBe(true)
    })
})
