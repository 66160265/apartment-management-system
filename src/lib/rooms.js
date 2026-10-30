// ตั้งค่าห้องพักครั้งแรกตอนติดตั้ง (components/RoomsSetup.jsx): สร้างรายการห้องจากจำนวนชั้นและจำนวนห้องต่อชั้น
// เลขห้อง = เลขชั้น + ลำดับห้อง 2 หลัก (ชั้น 2 ห้องที่ 3 = 203) เหมือนห้องชุดเริ่มต้นเดิม

// ชนิดห้องตามระบบทำความเย็น (rooms.cooling)
export const coolingTypes = {
    fan: 'ห้องพัดลม',
    air: 'ห้องแอร์',
}

// ข้อความสรุปรายละเอียดห้องสั้นๆ เช่น "ห้องแอร์ · มีเครื่องทำน้ำอุ่น" (แถวของห้องที่ยังไม่มีค่า = ห้องพัดลม ไม่มีเครื่องทำน้ำอุ่น)
export function roomFeatures(room) {
    return [coolingTypes[room.cooling] ?? coolingTypes.fan, room.water_heater ? 'มีเครื่องทำน้ำอุ่น' : 'ไม่มีเครื่องทำน้ำอุ่น']
}

export const MAX_FLOORS = 30
export const MAX_ROOMS_PER_FLOOR = 50

// ตรวจค่าที่กรอก: คืนข้อความ error ภาษาไทย หรือ '' ถ้าใช้ได้
export function validateSetup({ floors, perFloor, rent }) {
    const f = Number(floors)
    const p = Number(perFloor)
    if (floors === '' || !Number.isInteger(f) || f < 1 || f > MAX_FLOORS) return `จำนวนชั้นต้องเป็นเลข 1-${MAX_FLOORS}`
    if (perFloor === '' || !Number.isInteger(p) || p < 1 || p > MAX_ROOMS_PER_FLOOR) return `จำนวนห้องต่อชั้นต้องเป็นเลข 1-${MAX_ROOMS_PER_FLOOR}`
    if (rent === '' || rent == null || !Number.isFinite(Number(rent)) || Number(rent) < 0) return 'ค่าเช่าต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'
    return ''
}

// สร้างรายการห้องทั้งหมด (ทุกห้องว่าง ค่าเช่าเท่ากัน แก้รายห้องทีหลังได้ในหน้าห้องพัก)
export function buildRooms({ floors, perFloor, rent }) {
    const rooms = []
    for (let f = 1; f <= Number(floors); f++) {
        for (let n = 1; n <= Number(perFloor); n++) {
            rooms.push({ number: `${f}${String(n).padStart(2, '0')}`, floor: f, status: 'vacant', rent: Number(rent) })
        }
    }
    return rooms
}
