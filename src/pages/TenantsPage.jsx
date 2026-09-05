import { tenants } from '../data/tenants'

function TenantsPage() {
    return (
        <>
            <div className="flex justify-between items-center p-6">
                <h1 className="text-xl font-bold">จัดการผู้เช่า</h1>
                <div className="flex items-center gap-4">
                    <button className="bg-[#534AB7] text-white px-4 py-2 rounded-lg">
                        + เพิ่มผู้เช่า
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                        AD
                    </div>
                </div>
            </div>
            <div className="px-6">
                <div className="flex items-center gap-2 border rounded-lg px-4 py-2 w-96">
                    <span>🔍</span>
                    <input type="text" placeholder="ค้นหาชื่อ/ห้อง" className="outline-none w-full" />
                </div>
            </div>
            <div className="mx-6 mt-4 bg-white rounded-lg shadow-sm p-4">
                <table className="w-full text-left">
                    <thead>
                        <tr>
                            <th className="pb-2">ห้อง</th>
                            <th className="pb-2">ชื่อ-สกุล</th>
                            <th className="pb-2">เบอร์โทร</th>
                            <th className="pb-2">เริ่มสัญญา</th>
                            <th className="pb-2">สิ้นสุดสัญญา</th>
                            <th className="pb-2 text-right">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tenants.map((t) => (
                            <tr key={t.room} className="border-t">
                                <td className="py-3">{t.room}</td>
                                <td className="py-3">{t.name}</td>
                                <td className="py-3">{t.phone}</td>
                                <td className="py-3">{t.startDate}</td>
                                <td className="py-3">{t.endDate}</td>
                                <td className="py-3 text-right">
                                    <button className="bg-gray-200 px-3 py-1 rounded-lg">รายละเอียด</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}

export default TenantsPage;