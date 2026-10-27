import { useState } from 'react'

// ปุ่มคัดลอกข้อความ
function CopyButton({ text, label = 'คัดลอก' }) {
    const [copied, setCopied] = useState(false)
    // คัดลอกข้อความลงคลิปบอร์ด แล้วแสดง "คัดลอกแล้ว" ชั่วคราว
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            // fallback
        }
    }
    return (
        <button
            type="button"
            onClick={copy}
            className="text-xs px-2.5 py-1 rounded-lg bg-sand/80 hover:bg-mist/60 text-primary-dark font-medium border border-line transition cursor-pointer"
        >
            {copied ? 'คัดลอกแล้ว' : label}
        </button>
    )
}

export default CopyButton
