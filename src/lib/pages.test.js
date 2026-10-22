import { describe, expect, it, vi } from 'vitest'
import { prefetchOrder, prefetchPages } from './pages'

// idle จำลอง: เก็บ callback ไว้ให้เทสต์สั่งให้ทำงานทีละรอบ
function fakeIdle() {
    const queue = []
    const idle = (cb) => {
        queue.push(cb)
        return () => {
            const i = queue.indexOf(cb)
            if (i >= 0) queue.splice(i, 1)
        }
    }
    const flush = async () => {
        const cb = queue.shift()
        cb?.()
        await Promise.resolve()
        await Promise.resolve()
    }
    return { idle, flush, size: () => queue.length }
}

const loadersOf = (keys) => Object.fromEntries(keys.map((k) => [k, vi.fn(() => Promise.resolve({}))]))

describe('prefetchPages', () => {
    it('ดึงทีละหน้าตามลำดับ ครั้งละหนึ่งหน้าต่อรอบที่เครื่องว่าง', async () => {
        const f = fakeIdle()
        const loaders = loadersOf(prefetchOrder.user)
        prefetchPages('user', { idle: f.idle, loaders, connection: {} })
        expect(loaders.invoices).not.toHaveBeenCalled()
        await f.flush()
        expect(loaders.invoices).toHaveBeenCalledTimes(1)
        expect(loaders.repairs).not.toHaveBeenCalled()
        await f.flush()
        expect(loaders.repairs).toHaveBeenCalledTimes(1)
    })

    it('ครบทุกหน้าแล้วหยุดเอง ไม่เรียกซ้ำ', async () => {
        const f = fakeIdle()
        const loaders = loadersOf(prefetchOrder.user)
        prefetchPages('user', { idle: f.idle, loaders, connection: {} })
        for (let i = 0; i < prefetchOrder.user.length + 3; i++) await f.flush()
        for (const key of prefetchOrder.user) expect(loaders[key]).toHaveBeenCalledTimes(1)
        expect(f.size()).toBe(0)
    })

    it('ยกเลิกได้ ไม่โหลดต่อ', async () => {
        const f = fakeIdle()
        const loaders = loadersOf(prefetchOrder.user)
        const cancel = prefetchPages('user', { idle: f.idle, loaders, connection: {} })
        await f.flush()
        cancel()
        await f.flush()
        await f.flush()
        expect(loaders.repairs).not.toHaveBeenCalled()
    })

    it('หน้าที่โหลดพังไม่ทำให้ลำดับหยุด (ข้ามไปหน้าถัดไป)', async () => {
        const f = fakeIdle()
        const loaders = loadersOf(prefetchOrder.user)
        loaders.invoices = vi.fn(() => Promise.reject(new Error('network')))
        prefetchPages('user', { idle: f.idle, loaders, connection: {} })
        await f.flush()
        await f.flush()
        await f.flush()
        expect(loaders.repairs).toHaveBeenCalledTimes(1)
    })

    it('โหมดประหยัดข้อมูล (saveData) ไม่ prefetch เลย', async () => {
        const f = fakeIdle()
        const loaders = loadersOf(prefetchOrder.user)
        prefetchPages('user', { idle: f.idle, loaders, connection: { saveData: true } })
        expect(f.size()).toBe(0)
        expect(loaders.invoices).not.toHaveBeenCalled()
    })

    it('สิทธิ์ที่ไม่รู้จัก ไม่ error และไม่โหลดอะไร', async () => {
        const f = fakeIdle()
        const loaders = loadersOf(prefetchOrder.user)
        prefetchPages('ghost', { idle: f.idle, loaders, connection: {} })
        await f.flush()
        for (const key of Object.keys(loaders)) expect(loaders[key]).not.toHaveBeenCalled()
    })

    it('ลำดับของผู้เช่าไม่รวมหน้าของแอดมิน', () => {
        for (const adminOnly of ['settings', 'audit', 'adminUsers', 'reports', 'tenants', 'rooms']) expect(prefetchOrder.user).not.toContain(adminOnly)
    })
})
