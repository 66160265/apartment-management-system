import Icon from './Icon'
import { repairProgressKeys, repairStatuses } from '../data/repairs'

// แถบความคืบหน้า 3 ขั้น: รอดำเนินการ -> กำลังดำเนินการ -> เสร็จสิ้น
function RepairProgress({ status }) {
    // ลำดับของสถานะปัจจุบัน (0 = รอดำเนินการ, 1 = กำลังดำเนินการ, 2 = เสร็จ)
    const current = repairProgressKeys.indexOf(status)
    return (
        <ol className="grid grid-cols-3">
            {repairProgressKeys.map((k, i) => {
                // ขั้นที่ผ่านแล้ว (มีเครื่องหมายถูก), ขั้นปัจจุบัน (วงกลมเน้น), และขั้นที่ไปถึงแล้ว (เส้นเชื่อมเป็นสี)
                const isDone = i < current || status === 'done'
                const isCurrent = i === current && status !== 'done'
                const reached = i <= current
                return (
                    <li key={k} className="relative flex flex-col items-center gap-1.5">
                        {i > 0 && <span className={`absolute top-2.5 right-1/2 w-full h-0.5 -translate-y-1/2 ${reached ? 'bg-primary' : 'bg-line'}`} />}
                        <span
                            className={`relative z-10 grid place-items-center w-5 h-5 rounded-full ${
                                isDone
                                    ? 'bg-primary text-white'
                                    : isCurrent
                                      ? 'bg-white border-[5px] border-primary ring-4 ring-primary/15'
                                      : 'bg-white border-2 border-line'
                            }`}
                        >
                            {isDone && <Icon name="check" className="w-3 h-3" />}
                        </span>
                        <span className={`text-xs ${isCurrent ? 'text-primary-dark font-semibold' : reached ? 'text-primary-dark' : 'text-muted/60'}`}>
                            {repairStatuses[k].label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

export default RepairProgress
