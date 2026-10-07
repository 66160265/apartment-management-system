import { useState } from 'react'
import { initialRepairs, statuses } from '../data/repairs'

// กำหนดสีของแต่ละสถานะตามรูปแบบตาราง
const statusStyles = {
    'เสร็จสิ้น': 'bg-[#7eed7a] text-gray-900',
    'กำลังดำเนิน': 'bg-[#fed766] text-gray-900',
    'รอดำเนินการ': 'bg-[#c5f4fa] text-gray-900',
}

function RepairsPage() {
    const [repairs, setRepairs] = useState(initialRepairs)
    const [activeTab, setActiveTab] = useState('ทั้งหมด')
    // editingItem: null = หน้าตารางรายการ, object = หน้าจัดการ/แก้ไขรายการนั้น, 'new' = สร้างรายการใหม่
    const [editingItem, setEditingItem] = useState(null)
    const [formData, setFormData] = useState({
        room: '',
        date: '',
        problem: '',
        status: 'รอดำเนินการ',
        image: null,
    })
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // กรองข้อมูลตามแท็บสถานะ
    const filteredRepairs = repairs.filter((r) => {
        if (activeTab === 'ทั้งหมด') return true
        return r.status === activeTab
    })

    // กด "จัดการ" จากตาราง
    const handleOpenEdit = (item) => {
        setFormData({ ...item })
        setEditingItem(item)
    }

    // กด "+ แจ้งซ่อม" เพื่อเพิ่มรายการใหม่
    const handleOpenNew = () => {
        const today = new Date()
        const thaiMonths = [
            'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
            'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
        ]
        const dateStr = `${today.getDate()} ${thaiMonths[today.getMonth()]}`

        setFormData({
            room: '',
            date: dateStr,
            problem: '',
            status: 'รอดำเนินการ',
            image: null,
        })
        setEditingItem('new')
    }

    // อัปโหลดหรือเปลี่ยนรูปภาพ
    const handleImageChange = (e) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = () => {
                setFormData((prev) => ({ ...prev, image: reader.result }))
            }
            reader.readAsDataURL(file)
        }
    }

    // บันทึกข้อมูล
    const handleSave = (e) => {
        e.preventDefault()
        if (!formData.room.trim() || !formData.problem.trim()) return

        if (editingItem === 'new') {
            const newItem = {
                id: Date.now(),
                room: formData.room.trim(),
                date: formData.date.trim() || 'วันนี้',
                problem: formData.problem.trim(),
                status: formData.status,
                image: formData.image,
            }
            setRepairs([newItem, ...repairs])
        } else {
            setRepairs(
                repairs.map((r) => (r.id === editingItem.id ? { ...formData } : r))
            )
        }
        setEditingItem(null)
    }

    // ลบรายการ
    const handleDelete = () => {
        if (editingItem && editingItem.id) {
            setRepairs(repairs.filter((r) => r.id !== editingItem.id))
        }
        setShowDeleteConfirm(false)
        setEditingItem(null)
    }

    return (
        <div className="p-6">
            {/* Header ด้านบน: ระบบแจ้งซ่อม และ Avatar AD */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">ระบบแจ้งซ่อม</h1>
                <div className="flex items-center gap-3">
                    {!editingItem && (
                        <button
                            onClick={handleOpenNew}
                            className="bg-primary hover:bg-primary-dark transition-colors text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>+</span>
                            <span>แจ้งซ่อม</span>
                        </button>
                    )}
                    <div className="w-10 h-10 rounded-full bg-[#d8b4fe] text-[#581c87] font-semibold flex items-center justify-center text-sm shadow-xs">
                        AD
                    </div>
                </div>
            </div>

            {/* ถ้ากำลังกดจัดการ (หน้าจัดการตามรูปภาพที่ 2) */}
            {editingItem ? (
                <div className="bg-white rounded-2xl shadow-card p-6 md:p-8 max-w-4xl mx-auto border border-line">
                    <form onSubmit={handleSave} className="flex flex-col gap-5">
                        {/* แถวที่ 1: ห้อง และ วันที่ */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-500 mb-1">
                                    ห้อง
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={formData.room}
                                    onChange={(e) =>
                                        setFormData({ ...formData, room: e.target.value })
                                    }
                                    className="w-full border border-gray-300 rounded-xl px-4 py-2 text-gray-900 font-semibold text-sm outline-none focus:border-[#5025d1]"
                                    placeholder="เช่น 203"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-500 mb-1">
                                    วันที่
                                </label>
                                <input
                                    type="text"
                                    value={formData.date}
                                    onChange={(e) =>
                                        setFormData({ ...formData, date: e.target.value })
                                    }
                                    className="w-full border border-gray-300 rounded-xl px-4 py-2 text-gray-900 font-semibold text-sm outline-none focus:border-[#5025d1]"
                                    placeholder="เช่น 5 มิ.ย."
                                />
                            </div>
                        </div>

                        {/* แถวที่ 2: ปัญหา */}
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">
                                ปัญหา
                            </label>
                            <input
                                required
                                type="text"
                                value={formData.problem}
                                onChange={(e) =>
                                    setFormData({ ...formData, problem: e.target.value })
                                }
                                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-gray-900 font-semibold text-sm outline-none focus:border-[#5025d1]"
                                placeholder="เช่น หลอดไฟขาด"
                            />
                        </div>

                        {/* แถวที่ 3: สถานะ */}
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">
                                สถานะ
                            </label>
                            <div className="relative">
                                <select
                                    value={formData.status}
                                    onChange={(e) =>
                                        setFormData({ ...formData, status: e.target.value })
                                    }
                                    className="w-full appearance-none border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 font-semibold text-sm outline-none focus:border-[#5025d1] bg-white cursor-pointer pr-10"
                                >
                                    {statuses.map((st) => (
                                        <option key={st} value={st}>
                                            {st}
                                        </option>
                                    ))}
                                </select>
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-xs">
                                    ▼
                                </span>
                            </div>
                        </div>

                        {/* แถวที่ 4: รูปภาพ */}
                        <div>
                            <label className="block text-sm text-gray-500 mb-1">
                                รูปภาพ
                            </label>
                            <div className="border border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center min-h-[320px] bg-white relative">
                                {formData.image ? (
                                    <div className="flex flex-col items-center gap-3 w-full">
                                        <img
                                            src={formData.image}
                                            alt="รูปภาพปัญหา"
                                            className="max-h-[380px] max-w-full rounded-lg object-contain shadow-xs"
                                        />
                                        <div className="flex items-center gap-3">
                                            <label className="text-xs text-[#5025d1] hover:underline cursor-pointer font-medium">
                                                เปลี่ยนรูปภาพ
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleImageChange}
                                                    className="hidden"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        image: null,
                                                    }))
                                                }
                                                className="text-xs text-red-500 hover:underline cursor-pointer font-medium"
                                            >
                                                นำรูปภาพออก
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center gap-2 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors p-8">
                                        <span className="text-4xl">📷</span>
                                        <span className="text-sm font-medium">
                                            คลิกเพื่อแนบรูปภาพปัญหา
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            PNG, JPG หรือ WebP
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* ปุ่มด้านล่าง: ลบ | ยกเลิก และ บันทึก */}
                        <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-100">
                            {editingItem !== 'new' ? (
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="border border-red-500 text-red-600 hover:bg-red-50 rounded-xl px-8 py-2.5 text-sm font-semibold transition-colors cursor-pointer w-full sm:w-auto"
                                >
                                    ลบ
                                </button>
                            ) : (
                                <div />
                            )}

                            <div className="flex gap-4 w-full sm:w-auto justify-end">
                                <button
                                    type="button"
                                    onClick={() => setEditingItem(null)}
                                    className="border border-gray-800 text-gray-800 hover:bg-gray-100 rounded-xl px-10 py-2.5 text-sm font-semibold transition-colors cursor-pointer flex-1 sm:flex-initial"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="bg-[#5025d1] hover:bg-[#431db0] text-white rounded-xl px-12 py-2.5 text-sm font-semibold transition-colors shadow-sm cursor-pointer flex-1 sm:flex-initial"
                                >
                                    บันทึก
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            ) : (
                /* หน้าตารางหลัก (ตามรูปภาพที่ 1) */
                <>
                    {/* แท็บตัวกรองสถานะ */}
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <button
                            onClick={() => setActiveTab('ทั้งหมด')}
                            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                                activeTab === 'ทั้งหมด'
                                    ? 'bg-[#ebd5fc] text-purple-900 border border-[#d8b4fe]'
                                    : 'bg-white text-gray-700 border border-gray-400 hover:bg-gray-50'
                            }`}
                        >
                            ทั้งหมด ({repairs.length})
                        </button>

                        {statuses.map((st) => {
                            const count = repairs.filter((r) => r.status === st).length
                            const isActive = activeTab === st
                            return (
                                <button
                                    key={st}
                                    onClick={() => setActiveTab(st)}
                                    className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                                        isActive
                                            ? 'bg-[#ebd5fc] text-purple-900 border border-[#d8b4fe]'
                                            : 'bg-white text-gray-700 border border-gray-400 hover:bg-gray-50'
                                    }`}
                                >
                                    {st} ({count})
                                </button>
                            )
                        })}
                    </div>

                    {/* ตารางแสดงรายการแจ้งซ่อม */}
                    <div className="bg-white rounded-2xl shadow-card p-6 overflow-x-auto border border-line">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-gray-500 font-medium text-sm border-b border-gray-200">
                                    <th className="pb-3 font-medium w-24">ห้อง</th>
                                    <th className="pb-3 font-medium w-32">วันที่</th>
                                    <th className="pb-3 font-medium">ปัญหา</th>
                                    <th className="pb-3 font-medium w-36 text-center">สถานะ</th>
                                    <th className="pb-3 font-medium w-24 text-right"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRepairs.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="border-b border-gray-200 last:border-b-0 hover:bg-sand/40 transition-colors"
                                    >
                                        <td className="py-4 font-bold text-gray-900 text-base">
                                            {r.room}
                                        </td>
                                        <td className="py-4 text-gray-500 text-sm">
                                            {r.date}
                                        </td>
                                        <td className="py-4 font-semibold text-gray-900 text-sm">
                                            {r.problem}
                                        </td>
                                        <td className="py-4 text-center">
                                            <span
                                                className={`inline-block px-5 py-1 rounded-full text-xs font-semibold ${
                                                    statusStyles[r.status] ||
                                                    'bg-gray-100 text-gray-800'
                                                }`}
                                            >
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="py-4 text-right">
                                            <button
                                                onClick={() => handleOpenEdit(r)}
                                                className="bg-[#d1d5db] hover:bg-[#9ca3af] text-gray-800 font-medium px-3.5 py-1 rounded-md text-xs transition-colors cursor-pointer"
                                            >
                                                จัดการ
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {filteredRepairs.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan="5"
                                            className="py-10 text-center text-gray-400 text-sm"
                                        >
                                            ไม่มีรายการแจ้งซ่อม
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Popup ยืนยันการลบรายการ */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 shadow-xl w-[360px] max-w-full flex flex-col gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                            ยืนยันการลบรายการ
                        </h3>
                        <p className="text-sm text-gray-600">
                            คุณต้องการลบรายการแจ้งซ่อมห้อง{' '}
                            <span className="font-semibold text-gray-900">
                                {formData.room} ({formData.problem})
                            </span>{' '}
                            ใช่หรือไม่?
                        </p>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-1.5 rounded-lg text-sm cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                            >
                                ลบรายการ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RepairsPage
