import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { initialNotifications, formatNotificationTime } from '../data/notifications'

// แมปสีของจุดแจ้งเตือนตามภาพต้นแบบ
const dotColorClasses = {
    red: 'bg-[#ef4444]',
    orange: 'bg-[#f59e0b]',
    green: 'bg-[#22c55e]',
    gray: 'bg-[#6b7280]',
}

function NotificationsPage() {
    const navigate = useNavigate()
    const [notifications, setNotifications] = useState(initialNotifications)
    const [selectedItem, setSelectedItem] = useState(null)

    // ปิด Modal ด้วยปุ่ม Esc
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setSelectedItem(null)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    // เมื่อกดคลิกดูรายละเอียด ให้เปลี่ยนสีวงกลมเป็นสีเทา
    const handleOpenDetail = (item) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, dotColor: 'gray' } : n))
        )
        setSelectedItem({ ...item, dotColor: 'gray' })
    }

    return (
        <div className="p-6">
            {/* Header ด้านบน: หัวข้อ แจ้งเตือน และ Avatar AD */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">แจ้งเตือน</h1>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#d8b4fe] text-[#581c87] font-semibold flex items-center justify-center text-sm shadow-xs">
                        AD
                    </div>
                </div>
            </div>

            {/* กล่องแสดงรายการแจ้งเตือน ตามเทมเพลตและรูปภาพต้นแบบ */}
            <div className="bg-white rounded-2xl shadow-card p-6 md:p-8 border border-line">
                <div className="flex flex-col">
                    {notifications.map((item) => {
                        const dotColor = dotColorClasses[item.dotColor] || dotColorClasses.gray

                        return (
                            <div
                                key={item.id}
                                onClick={() => handleOpenDetail(item)}
                                className="group py-4 px-3 sm:px-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-sand/40 rounded-xl transition-all border-b border-gray-200"
                                title="คลิกเพื่อดูรายละเอียดเพิ่มเติม"
                            >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                    {/* จุดสีแจ้งเตือน */}
                                    <span
                                        className={`w-3.5 h-3.5 rounded-full shrink-0 transition-transform group-hover:scale-125 ${dotColor}`}
                                    />

                                    {/* ข้อความแจ้งเตือน */}
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm sm:text-base font-bold text-gray-900">
                                            {item.title}
                                        </h2>
                                        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                                            {item.subtitle}
                                        </p>
                                    </div>
                                </div>

                                {/* เวลาการส่งตรงส่วนท้ายช่อง */}
                                <span className="text-xs sm:text-sm text-gray-400 group-hover:text-gray-600 transition-colors shrink-0">
                                    {formatNotificationTime(item.createdAt || item.time)}
                                </span>
                            </div>
                        )
                    })}

                    {notifications.length === 0 && (
                        <div className="py-12 text-center text-gray-400 text-sm">
                            ไม่มีรายการแจ้งเตือน
                        </div>
                    )}
                </div>
            </div>

            {/* Modal แสดงรายละเอียดเพิ่มเติมเมื่อกดที่ข้อความ */}
            {selectedItem && (
                <div
                    className="fixed inset-0 bg-primary-deep/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
                    onClick={() => setSelectedItem(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-[560px] max-w-full overflow-hidden border border-line flex flex-col animate-in fade-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header ของ Modal */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-sand/30">
                            <div className="flex items-center gap-3">
                                <span
                                    className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                                        dotColorClasses[selectedItem.dotColor] || dotColorClasses.gray
                                    }`}
                                />
                                <h2 className="text-lg font-bold text-gray-900">
                                    {selectedItem.title}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedItem(null)}
                                className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white text-lg transition-colors cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* เนื้อหาใน Modal */}
                        <div className="p-6 flex flex-col gap-4">
                            {/* แท็กประเภท */}
                            {selectedItem.typeLabel && (
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#ebd5fc] text-purple-900 border border-[#d8b4fe]">
                                        {selectedItem.typeLabel}
                                    </span>
                                </div>
                            )}

                            {/* กล่องข้อมูลอ้างอิง */}
                            <div className="bg-sand/40 p-4 rounded-xl border border-line flex flex-col gap-2">
                                <div className="flex justify-between items-center text-xs text-gray-500">
                                    <span className="font-medium">ข้อมูลอ้างอิง</span>
                                    <span>เวลาที่ส่ง: {formatNotificationTime(selectedItem.createdAt || selectedItem.time, true)}</span>
                                </div>
                                <div className="text-base text-gray-900 font-bold">
                                    {selectedItem.subtitle}
                                </div>
                                {selectedItem.tenantName && (
                                    <div className="text-xs text-gray-600 pt-1 border-t border-line/60 flex flex-wrap gap-x-4 gap-y-1">
                                        <span>
                                            ผู้เกี่ยวข้อง:{' '}
                                            <strong className="text-gray-800">
                                                {selectedItem.tenantName}
                                            </strong>
                                        </span>
                                        {selectedItem.phone && (
                                            <span>
                                                เบอร์โทรติดต่อ:{' '}
                                                <strong className="text-gray-800">
                                                    {selectedItem.phone}
                                                </strong>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* รายละเอียดเพิ่มเติม */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 mb-1.5">
                                    รายละเอียดการแจ้งเตือน
                                </h3>
                                <div className="text-sm text-gray-700 leading-relaxed bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
                                    {selectedItem.details}
                                </div>
                            </div>
                        </div>

                        {/* ส่วนท้าย Modal: ปุ่มปิด และปุ่มนำทาง */}
                        <div className="px-6 py-4 bg-sand/20 border-t border-gray-100 flex justify-end items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedItem(null)}
                                className="border border-gray-300 text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                            >
                                ปิด
                            </button>
                            {selectedItem.actionLink && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedItem(null)
                                        navigate(selectedItem.actionLink)
                                    }}
                                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                    <span>{selectedItem.actionLabel}</span>
                                    <span>→</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default NotificationsPage
