import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'

// ปุ่มลูกศรลงทรงกลมโปร่งแสง กลางจอด้านล่าง: ขึ้นเมื่อหน้ายังเลื่อนลงได้ (เหลือเนื้อหาด้านล่างเกิน 80px) กดแล้วเลื่อนลงเกือบหนึ่งจอ
// หน้าที่มีแถบติดขอบล่าง (ใส่ data-bottom-bar ที่แถบ เช่น ปุ่มบันทึก) ปุ่มจะลอยอยู่เหนือแถบ ไม่ทับปุ่มของแถบ
const GAP = 20

function ScrollDownHint({ watchKey }) {
    const [state, setState] = useState({ show: false, bottom: GAP })

    useEffect(() => {
        let frame = 0
        const update = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
                const doc = document.documentElement
                const left = doc.scrollHeight - (window.scrollY + window.innerHeight)
                const bar = document.querySelector('[data-bottom-bar]')
                const bottom = bar ? Math.max(GAP, window.innerHeight - bar.getBoundingClientRect().top + 12) : GAP
                setState((s) => (s.show === left > 80 && s.bottom === bottom ? s : { show: left > 80, bottom }))
            })
        }
        update()
        window.addEventListener('scroll', update, { passive: true })
        window.addEventListener('resize', update)
        // เนื้อหาโหลดเสร็จหรือเปลี่ยนความสูง (เช่น เปิด/ปิดส่วนต่าง ๆ) ให้คำนวณใหม่
        const observer = new ResizeObserver(update)
        observer.observe(document.body)
        return () => {
            cancelAnimationFrame(frame)
            window.removeEventListener('scroll', update)
            window.removeEventListener('resize', update)
            observer.disconnect()
        }
    }, [watchKey])

    if (!state.show) return null
    return (
        <button
            type="button"
            onClick={() => window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: 'smooth' })}
            aria-label="เลื่อนลง"
            title="เลื่อนลง"
            style={{ bottom: state.bottom }}
            // กลางพื้นที่เนื้อหา (จอใหญ่เลื่อนไปทางขวาครึ่งความกว้างเมนูข้าง 16rem) โปร่งแสง ชี้แล้วชัดขึ้น
            className="fixed left-1/2 lg:left-[calc(50%+8rem)] -translate-x-1/2 z-30 grid place-items-center w-11 h-11 rounded-full bg-white/50 text-primary-dark/80 shadow-card ring-1 ring-white/60 backdrop-blur-sm hover:bg-white/90 hover:text-primary-dark motion-safe:animate-bounce"
        >
            <Icon name="chevronDown" className="w-6 h-6" />
        </button>
    )
}

export default ScrollDownHint
