import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabaseClient'
import { REQUIRED_DOCS, formatDate } from '../lib/tenants'
import { SkeletonList } from './Skeleton.jsx'

// ขนาดไฟล์สูงสุด 10 MB และชนิดไฟล์ที่รับ (MIME -> นามสกุล)
const MAX_SIZE = 10 * 1024 * 1024
const EXTENSIONS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// แสดงขนาดไฟล์เป็น KB หรือ MB
const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`)

// คลาสของปุ่มในกลุ่มปุ่ม ดู/แก้ไข
const btn = 'px-3.5 py-2 sm:px-3 sm:py-1 text-sm hover:bg-mist/50'

// แถวเอกสารหนึ่งประเภท: ถ้ามีไฟล์แล้วแสดงปุ่มดู/แก้ไข/ลบ ถ้ายังไม่มีแสดงปุ่มเพิ่ม
function DocRow({ title, doc, onAdd, onView, onEdit, onDelete }) {
    return (
        <div
            className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${
                doc ? 'border-line bg-white hover:border-secondary/60' : 'border-dashed border-line bg-sand/40'
            }`}
        >
            {/* ไอคอน: มีไฟล์แล้ว = เอกสารสีเขียว, ยังไม่มี = ไอคอนอัปโหลด */}
            <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${doc ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-muted ring-1 ring-line'}`}>
                <Icon name={doc ? 'fileText' : 'upload'} className="w-5 h-5" />
            </span>
            {/* ชื่อเอกสาร + ชื่อไฟล์และวันที่อัปโหลด */}
            <div className="flex-1 min-w-40">
                <div className="text-sm font-medium text-ink">{title}</div>
                <div className="text-xs text-muted truncate">
                    {doc ? `${doc.file_name} · อัปโหลด ${formatDate(doc.uploaded_at)}` : 'ยังไม่ได้อัปโหลด'}
                </div>
            </div>
            {/* มีไฟล์: ปุ่มดู/แก้ไข/ลบ, ยังไม่มี: ปุ่มเพิ่มเอกสาร */}
            {doc ? (
                <div className="inline-flex rounded-lg border border-line bg-white overflow-hidden divide-x divide-line">
                    <button type="button" onClick={() => onView(doc)} className={`${btn} text-primary-dark`}>ดู</button>
                    <button type="button" onClick={() => onEdit(doc)} className={`${btn} text-ink`}>แก้ไข</button>
                    <button type="button" onClick={() => onDelete(doc)} className="px-3.5 py-2 sm:px-3 sm:py-1 text-sm text-red-600 hover:bg-red-50">ลบ</button>
                </div>
            ) : (
                <button type="button" onClick={onAdd} className="px-4 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark">เพิ่มเอกสาร</button>
            )}
        </div>
    )
}

// กล่องเพิ่ม/แก้ไขเอกสาร: เลือกไฟล์ (และตั้งชื่อสำหรับเอกสารเพิ่มเติม)
function DocumentModal({ doc, room, onSaved, onCancel }) {
    // isEdit = แก้ไขเอกสารเดิม, isOther = เอกสารประเภทอื่น ๆ (ต้องตั้งชื่อเอง)
    const inputRef = useRef(null)
    const isEdit = !!doc.id
    const isOther = doc.type === 'other'
    const [title, setTitle] = useState(doc.title ?? '')
    const [file, setFile] = useState(null)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    // ตรวจไฟล์ที่เลือก (ชนิด PDF/รูป และขนาดไม่เกิน 10 MB) ก่อนเก็บไว้รออัปโหลด
    const pick = (f) => {
        setError('')
        if (!f) return
        if (!EXTENSIONS[f.type]) setError('รองรับเฉพาะไฟล์ PDF, JPG, PNG หรือ WEBP')
        else if (f.size > MAX_SIZE) setError('ไฟล์ต้องมีขนาดไม่เกิน 10 MB')
        else setFile(f)
    }

    // บันทึกเอกสาร: อัปโหลดไฟล์ไป storage แล้วเพิ่มหรืออัปเดตแถวใน tenant_documents
    const handleSubmit = async (e) => {
        e.preventDefault()
        // ตรวจข้อมูล: เอกสารอื่นต้องมีชื่อ, เพิ่มใหม่ต้องเลือกไฟล์, แก้ไขแต่ไม่เปลี่ยนอะไรให้ปิดเลย
        if (isOther && !title.trim()) {
            setError('กรุณาตั้งชื่อเอกสาร')
            return
        }
        if (!isEdit && !file) {
            setError('กรุณาเลือกไฟล์เอกสาร')
            return
        }
        if (isEdit && !file && title.trim() === doc.title) {
            onCancel()
            return
        }
        setSaving(true)

        // มีไฟล์ใหม่: อัปโหลดไปโฟลเดอร์ของห้องก่อน
        let upload = null
        if (file) {
            const path = `${room}/${doc.type}-${Date.now()}.${EXTENSIONS[file.type]}`
            const { error: uploadError } = await supabase.storage.from('tenant-docs').upload(path, file, { contentType: file.type })
            if (uploadError) {
                setSaving(false)
                setError(`อัปโหลดไม่สำเร็จ: ${uploadError.message}`)
                return
            }
            upload = { file_path: path, file_name: file.name }
        }

        // บันทึกแถวเอกสาร: แก้ไข = update (อัปเดตเวลาอัปโหลด), เพิ่มใหม่ = insert
        const fields = { title: isOther ? title.trim() : doc.title, ...upload }
        const { error: dbError } = isEdit
            ? await supabase.from('tenant_documents').update({ ...fields, uploaded_at: new Date().toISOString() }).eq('id', doc.id)
            : await supabase.from('tenant_documents').insert({ room, type: doc.type, ...fields })

        // บันทึกไม่สำเร็จ: ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง
        if (dbError) {
            if (upload) await supabase.storage.from('tenant-docs').remove([upload.file_path])
            setSaving(false)
            setError(`บันทึกไม่สำเร็จ: ${dbError.message}`)
            return
        }
        // แทนที่ไฟล์เดิมสำเร็จแล้ว ลบไฟล์เก่าทิ้ง
        if (upload && isEdit) await supabase.storage.from('tenant-docs').remove([doc.file_path])
        await onSaved()
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 sm:p-6 shadow-xl w-[440px] max-w-[92vw] max-h-[92vh] overflow-y-auto flex flex-col gap-4">
                {/* หัวข้อ: เพิ่ม/แก้ไข + ชื่อประเภทเอกสาร */}
                <h2 className="text-lg font-semibold text-primary-dark">
                    {isEdit ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสาร'}{!isOther && ` · ${doc.title}`}
                </h2>
                {/* ช่องตั้งชื่อ (เฉพาะเอกสารอื่น ๆ) */}
                {isOther && (
                    <label className="text-sm text-muted">
                        ชื่อเอกสาร
                        <input
                            className="w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white"
                            value={title}
                            onChange={(e) => { setTitle(e.target.value); setError('') }}
                            placeholder="เช่น ทะเบียนบ้าน, ใบรับรองการทำงาน"
                            autoFocus
                        />
                    </label>
                )}
                {/* เลือกไฟล์: ซ่อน input จริงไว้ กดผ่านปุ่มกรอบเส้นประ */}
                <div className="text-sm text-muted">
                    {isEdit ? 'เลือกไฟล์ใหม่เพื่อแทนที่ไฟล์เดิม (ถ้าไม่เลือกจะเก็บไฟล์เดิมไว้)' : 'ไฟล์เอกสาร'}
                    <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files[0])} className="hidden" />
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="mt-1 w-full border-2 border-dashed border-line bg-sand/50 hover:border-secondary hover:bg-mist/30 rounded-xl px-4 py-5 text-center"
                    >
                        {file ? (
                            <span className="text-ink">{file.name} · {formatSize(file.size)}</span>
                        ) : (
                            <span>คลิกเพื่อเลือกไฟล์ <span className="block text-xs mt-1">PDF, JPG, PNG, WEBP · ไม่เกิน 10 MB</span></span>
                        )}
                    </button>
                    {isEdit && !file && <span className="block mt-1 text-xs">ไฟล์ปัจจุบัน: {doc.file_name}</span>}
                </div>
                {/* ข้อความ error และปุ่มยกเลิก/บันทึก */}
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                </div>
            </form>
        </div>
    )
}

// หน้าต่างยืนยันการลบเอกสาร
function DeleteDocumentModal({ doc, onConfirm, onCancel }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // กดยืนยันลบ: เรียก onConfirm แล้วแสดงข้อความ error ถ้าลบไม่สำเร็จ
    const handleDelete = async () => {
        setBusy(true)
        const err = await onConfirm(doc)
        setBusy(false)
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-xl w-[400px] max-w-[92vw] flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">ลบเอกสาร</h2>
                <p className="text-sm text-ink">ลบ "{doc.title}" ({doc.file_name}) การลบไม่สามารถกู้คืนได้</p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button onClick={handleDelete} disabled={busy} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                        {busy ? 'กำลังลบ...' : 'ลบเอกสาร'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ดึงเอกสารทั้งหมดของห้อง เรียงตามเวลาที่อัปโหลด
const fetchDocs = (room) =>
    supabase.from('tenant_documents').select('*').eq('room', room).order('uploaded_at', { ascending: true })

// การ์ด "เอกสาร" ในหน้ารายละเอียดผู้เช่า: เพิ่ม ดู แก้ไข ลบ
function TenantDocuments({ room }) {
    // รายการเอกสาร, สถานะโหลด, error ตอนโหลด และ error ตอนกดดู
    const [docs, setDocs] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [actionError, setActionError] = useState('')
    // { doc } = เปิดกล่องเพิ่ม/แก้ไข, deleting = เอกสารที่จะลบ
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)

    // นำผลการโหลดไปตั้งค่า state (แสดง error ถ้าโหลดไม่สำเร็จ)
    const applyResult = useCallback(({ data, error }) => {
        if (error) setLoadError(`โหลดเอกสารไม่สำเร็จ: ${error.message}`)
        else {
            setDocs(data)
            setLoadError('')
        }
        setLoading(false)
    }, [])

    // โหลดรายการเอกสารใหม่ (ใช้หลังเพิ่ม/แก้ไข/ลบ)
    const load = async () => applyResult(await fetchDocs(room))

    // โหลดเอกสารเมื่อเปิดการ์ดหรือเปลี่ยนห้อง
    useEffect(() => {
        let active = true
        fetchDocs(room).then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [room, applyResult])

    // เปิดดูไฟล์เอกสารในแท็บใหม่ด้วยลิงก์ชั่วคราว (bucket เป็น private)
    const handleView = async (doc) => {
        setActionError('')
        // เปิดแท็บก่อนรอลิงก์ เพื่อไม่ให้เบราว์เซอร์บล็อกป็อปอัป
        const tab = window.open('', '_blank')
        const { data, error } = await supabase.storage.from('tenant-docs').createSignedUrl(doc.file_path, 120)
        if (error || !data?.signedUrl) {
            tab?.close()
            setActionError('เปิดเอกสารไม่สำเร็จ')
            return
        }
        if (tab) tab.location.href = data.signedUrl
        else window.location.href = data.signedUrl
    }

    // ลบแถวเอกสารและไฟล์ใน storage แล้วโหลดรายการใหม่
    const handleDelete = async (doc) => {
        const { error } = await supabase.from('tenant_documents').delete().eq('id', doc.id)
        if (error) return `ลบไม่สำเร็จ: ${error.message}`
        await supabase.storage.from('tenant-docs').remove([doc.file_path])
        await load()
        setDeleting(null)
    }

    // หลังบันทึกเอกสารสำเร็จ: โหลดรายการใหม่และปิดฟอร์ม
    const handleSaved = async () => {
        await load()
        setEditing(null)
    }

    // เอกสารหลักแต่ละประเภทจับคู่กับไฟล์ที่มี, เอกสารอื่น ๆ, และนับว่าครบหรือยัง
    const requiredRows = REQUIRED_DOCS.map((r) => ({ ...r, doc: docs.find((d) => d.type === r.type) }))
    const extras = docs.filter((d) => d.type === 'other')
    const done = requiredRows.filter((r) => r.doc).length
    const complete = done === REQUIRED_DOCS.length

    return (
        <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
            {/* หัวการ์ด + แถบความคืบหน้าเอกสารหลัก (ครบ = เขียว, ไม่ครบ = ส้ม) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-primary-dark">เอกสาร</h2>
                    <p className="text-sm text-muted">เอกสารหลักของผู้เช่า รองรับ PDF และรูปภาพ</p>
                </div>
                {!loading && !loadError && (
                    <div className="flex items-center gap-3">
                        <div className="w-28 h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={REQUIRED_DOCS.length}>
                            <div className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${(done / REQUIRED_DOCS.length) * 100}%` }} />
                        </div>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {complete ? 'ครบ' : `ยังไม่ครบ (${done}/${REQUIRED_DOCS.length})`}
                        </span>
                    </div>
                )}
            </div>

            {/* ข้อความกำลังโหลด / error */}
            {loading && <SkeletonList rows={2} avatar={false} className="-mx-4" />}
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}

            {/* รายการเอกสารหลัก + เอกสารอื่น ๆ และปุ่มเพิ่มเอกสารอื่น */}
            {!loading && !loadError && (
                <>
                    <div className="flex flex-col gap-2">
                        {requiredRows.map((r) => (
                            <DocRow key={r.type} title={r.title} doc={r.doc} onAdd={() => setEditing({ type: r.type, title: r.title })} onView={handleView} onEdit={setEditing} onDelete={setDeleting} />
                        ))}
                        {extras.map((d) => (
                            <DocRow key={d.id} title={d.title} doc={d} onView={handleView} onEdit={setEditing} onDelete={setDeleting} />
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setEditing({ type: 'other', title: '' })}
                        className="self-start flex items-center gap-2 border border-dashed border-secondary text-primary-dark hover:bg-mist/40 px-4 py-2 rounded-xl text-sm"
                    >
                        <Icon name="plus" className="w-4 h-4" />
                        เพิ่มเอกสารอื่น ๆ
                    </button>
                </>
            )}

            {/* กล่องเพิ่ม/แก้ไขเอกสาร และหน้าต่างยืนยันลบ */}
            {editing && <DocumentModal key={editing.id ?? editing.type + editing.title} doc={editing} room={room} onSaved={handleSaved} onCancel={() => setEditing(null)} />}
            {deleting && <DeleteDocumentModal doc={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
        </div>
    )
}

export default TenantDocuments
