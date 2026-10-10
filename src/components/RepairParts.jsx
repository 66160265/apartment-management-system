import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { repairStatuses } from '../data/repairs'
import { formatSize, getRepairImageUrl, validateImage } from '../lib/repairs'

export function RepairStatusBadge({ status }) {
    const s = repairStatuses[status] ?? { label: status, color: 'bg-gray-100 text-gray-800', dot: 'bg-gray-400' }
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${s.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    )
}

// แสดงรูปจาก storage (bucket private จึงต้องขอลิงก์ชั่วคราว) คลิกเพื่อเปิดรูปเต็ม
export function RepairImage({ path, className = 'max-h-80' }) {
    const [url, setUrl] = useState(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let active = true
        getRepairImageUrl(path).then((u) => {
            if (!active) return
            if (u) setUrl(u)
            else setFailed(true)
        })
        return () => {
            active = false
        }
    }, [path])

    if (failed) return <p className="text-sm text-red-600">โหลดรูปไม่สำเร็จ</p>
    if (!url) return <div className="w-48 h-40 rounded-xl bg-line/60 animate-pulse" aria-label="กำลังโหลดรูป" />
    return (
        <a href={url} target="_blank" rel="noreferrer" title="คลิกเพื่อเปิดรูปเต็มขนาด" className="block">
            <img src={url} alt="รูปภาพปัญหา" className={`${className} max-w-full w-auto object-contain rounded-xl shadow-card`} />
        </a>
    )
}

// ช่องแนบรูป: แสดงรูปใหม่ที่เลือก > รูปเดิมในระบบ > กล่องเลือกไฟล์
// onPick(file) เมื่อเลือกไฟล์ใหม่, onClear() เมื่อกดนำรูปออก
export function RepairImagePicker({ file, existingPath, onPick, onClear, disabled = false }) {
    const inputRef = useRef(null)
    const [preview, setPreview] = useState(null)
    const [error, setError] = useState('')

    // คืนหน่วยความจำของรูปตัวอย่างเมื่อเปลี่ยนรูปหรือปิดหน้า
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

    const pick = (f) => {
        if (!f) return
        const message = validateImage(f)
        setError(message)
        if (!message) {
            setPreview(URL.createObjectURL(f))
            onPick(f)
        }
        if (inputRef.current) inputRef.current.value = ''
    }

    const clear = () => {
        setError('')
        setPreview(null)
        onClear()
    }

    const hasImage = file || existingPath

    return (
        <div className="flex flex-col gap-2">
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pick(e.target.files[0])}
                disabled={disabled}
                className="hidden"
            />
            {hasImage ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-sand/70 border border-line p-4">
                    {file && preview ? (
                        <img src={preview} alt="ตัวอย่างรูปภาพ" className="max-h-72 max-w-full object-contain rounded-xl shadow-card" />
                    ) : (
                        <RepairImage path={existingPath} className="max-h-72" />
                    )}
                    <div className="flex items-center gap-4 text-sm">
                        {file && <span className="text-muted truncate max-w-48">{file.name} · {formatSize(file.size)}</span>}
                        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="text-primary hover:underline">
                            เปลี่ยนรูป
                        </button>
                        <button type="button" disabled={disabled} onClick={clear} className="text-red-600 hover:underline">
                            นำรูปออก
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault()
                        pick(e.dataTransfer.files[0])
                    }}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line hover:border-secondary hover:bg-sand/60 text-muted py-10 transition-colors"
                >
                    <Icon name="image" className="w-8 h-8" />
                    <span className="text-sm font-medium">คลิกหรือลากรูปมาวางเพื่อแนบรูปปัญหา</span>
                    <span className="text-xs">JPG, PNG หรือ WEBP ไม่เกิน 5 MB</span>
                </button>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    )
}

// หน้าต่างยืนยันการลบ/ยกเลิก
export function ConfirmDialog({ title, children, confirmLabel, busy, onCancel, onConfirm }) {
    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div role="alertdialog" aria-modal="true" className="bg-white rounded-2xl p-6 shadow-xl w-[380px] max-w-full flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-primary-dark">{title}</h3>
                <div className="text-sm text-muted">{children}</div>
                <div className="flex justify-end gap-2 mt-2">
                    <button type="button" onClick={onCancel} disabled={busy} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">
                        ไม่ใช่
                    </button>
                    <button type="button" onClick={onConfirm} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg font-medium">
                        {busy ? 'กำลังดำเนินการ...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
