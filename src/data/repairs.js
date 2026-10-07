import lampRepairImg from '../assets/lamp-repair.jpg'

export const initialRepairs = [
    {
        id: 1,
        room: '101',
        date: '10 มิ.ย.',
        problem: 'ท่อน้ำรั่ว ห้องน้ำ',
        status: 'เสร็จสิ้น',
        image: null,
    },
    {
        id: 2,
        room: '203',
        date: '8 มิ.ย.',
        problem: 'ไฟไม่แจ่ม',
        status: 'กำลังดำเนิน',
        image: null,
    },
    {
        id: 3,
        room: '203',
        date: '7 มิ.ย.',
        problem: 'ประตูฝืด',
        status: 'เสร็จสิ้น',
        image: null,
    },
    {
        id: 4,
        room: '203',
        date: '5 มิ.ย.',
        problem: 'หลอดไฟขาด',
        status: 'รอดำเนินการ',
        image: lampRepairImg,
    },
]

export const statuses = ['รอดำเนินการ', 'กำลังดำเนิน', 'เสร็จสิ้น']
