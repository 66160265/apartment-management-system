export const roomStatuses = [
    { value: 'occupied', label: 'มีผู้เช่า', color: 'bg-[#d4e6f1] border-secondary' },
    { value: 'vacant', label: 'ว่าง', color: 'bg-mist border-[#8fc2b8]' },
    { value: 'maintenance', label: 'ปรับปรุง', color: 'bg-[#f6e2b3] border-[#e0b955]' },
]

const vacant = ['103', '205', '302']
const maintenance = ['404']

export const rooms = [1, 2, 3, 4].flatMap((floor) =>
    [1, 2, 3, 4, 5].map((n) => {
        const number = `${floor}0${n}`
        return {
            number,
            floor,
            status: vacant.includes(number)
                ? 'vacant'
                : maintenance.includes(number)
                    ? 'maintenance'
                    : 'occupied',
            rent: 4500,
            note: '',
        }
    })
)
