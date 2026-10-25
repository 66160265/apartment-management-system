import { useState } from 'react'
import { baht } from '../lib/billing'
import { niceMax } from '../lib/chart'

// กราฟเส้นแนวโน้มรายรับ-รายจ่ายรายเดือน (หน่วยบาท แกนเดียว) วาดด้วย SVG ไม่ใช้ไลบรารี
// rows = [{ key, label, income, expense, net }] เรียงจากเก่าไปใหม่
// หลักการวาด: เส้นหนา 2px จุดปลายเส้น r=4 มีขอบสีพื้น 2px ป้ายตัวเลขเฉพาะเดือนล่าสุด ที่เหลืออ่านจาก tooltip หรือตาราง
// ชื่อซีรีส์อยู่ในคำอธิบายด้านบนเสมอ (ไม่ใช้สีอย่างเดียวบอกว่าเส้นไหนคืออะไร)

const WIDTH = 640
const HEIGHT = 240
const MARGIN = { top: 16, right: 84, bottom: 26, left: 60 }
const SURFACE = '#ffffff'
const GRID = '#e7e5e0'
const MUTED = '#6b6a66'
const INK = '#0b0b0b'

// ซีรีส์ตามลำดับสีหมวดหมู่ (ช่อง 1 ฟ้า, ช่อง 2 ส้ม) ผ่านตัวตรวจสีแล้ว
const SERIES = [
    { key: 'income', label: 'รายรับ', color: '#2a78d6' },
    { key: 'expense', label: 'รายจ่าย', color: '#eb6834' },
]

// ตัวเลขบนแกน: หลักพันขึ้นไปย่อเป็น "12k" ให้แกนแคบ
const axisLabel = (n) => (n >= 1000 ? `${Number((n / 1000).toFixed(n >= 10000 ? 0 : 1)).toLocaleString('th-TH')}k` : Number(n).toLocaleString('th-TH'))

function TrendChart({ title, rows }) {
    const [hover, setHover] = useState(null)

    const innerW = WIDTH - MARGIN.left - MARGIN.right
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
    const max = niceMax(Math.max(0, ...rows.flatMap((r) => [r.income, r.expense])))
    const step = rows.length > 1 ? innerW / (rows.length - 1) : 0
    const xOf = (i) => MARGIN.left + (rows.length > 1 ? step * i : innerW / 2)
    const yOf = (v) => MARGIN.top + innerH - (Math.max(0, v) / max) * innerH
    const ticks = [0, max / 2, max]
    const last = rows.length - 1
    const hasData = rows.some((r) => r.income > 0 || r.expense > 0)

    // ป้ายตัวเลขปลายเส้นของเดือนล่าสุด: ถ้าสองป้ายใกล้กันเกินไป ดันออกจากกันให้อ่านได้
    const endLabels = last >= 0 ? SERIES.map((s) => ({ ...s, value: rows[last][s.key], y: yOf(rows[last][s.key]) })) : []
    if (endLabels.length === 2 && Math.abs(endLabels[0].y - endLabels[1].y) < 16) {
        const mid = (endLabels[0].y + endLabels[1].y) / 2
        const [upper, lower] = endLabels[0].y <= endLabels[1].y ? [endLabels[0], endLabels[1]] : [endLabels[1], endLabels[0]]
        upper.y = mid - 8
        lower.y = mid + 8
    }

    const pathOf = (key) => rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(r[key])}`).join(' ')
    const hovered = hover !== null ? rows[hover] : null

    return (
        <figure className="flex flex-col gap-2 m-0">
            <figcaption className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-primary-dark">{title}</span>
                {/* คำอธิบายซีรีส์ (เส้นสั้นสีของซีรีส์ + ชื่อสีตัวอักษรปกติ) */}
                <span className="flex items-center gap-4 text-xs text-muted">
                    {SERIES.map((s) => (
                        <span key={s.key} className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: s.color }} />
                            {s.label}
                        </span>
                    ))}
                    <span>บาทต่อเดือน</span>
                </span>
            </figcaption>

            <div className="relative">
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="w-full h-auto"
                    role="img"
                    aria-label={`${title} ${rows.length} เดือน${rows[last] ? ` ล่าสุด รายรับ ${baht(rows[last].income)} รายจ่าย ${baht(rows[last].expense)}` : ''}`}
                >
                    {/* เส้นตารางและตัวเลขบนแกน (บาง จาง ไม่ประ) */}
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yOf(t)} y2={yOf(t)} stroke={GRID} strokeWidth="1" />
                            <text x={MARGIN.left - 8} y={yOf(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={MUTED}>
                                {axisLabel(t)}
                            </text>
                        </g>
                    ))}

                    {/* ป้ายเดือน เว้นเดือน กันชนกันบนจอเล็ก (ทุกเดือนดูได้ในตาราง) */}
                    {rows.map((r, i) =>
                        (last - i) % 2 === 0 ? (
                            <text key={r.key} x={xOf(i)} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill={MUTED}>
                                {r.label}
                            </text>
                        ) : null,
                    )}

                    {/* เส้นชี้เดือนที่เลือก */}
                    {hovered && <line x1={xOf(hover)} x2={xOf(hover)} y1={MARGIN.top} y2={MARGIN.top + innerH} stroke={MUTED} strokeWidth="1" opacity="0.5" />}

                    {hasData &&
                        SERIES.map((s) => (
                            <g key={s.key}>
                                <path d={pathOf(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                                {/* จุดปลายเส้น (เดือนล่าสุด) และจุดของเดือนที่ชี้อยู่ */}
                                {[last, ...(hover !== null && hover !== last ? [hover] : [])].map((i) => (
                                    <circle key={i} cx={xOf(i)} cy={yOf(rows[i][s.key])} r="4" fill={s.color} stroke={SURFACE} strokeWidth="2" />
                                ))}
                            </g>
                        ))}

                    {/* ตัวเลขเดือนล่าสุดที่ปลายเส้น (สีตัวอักษร ไม่ใช่สีซีรีส์) */}
                    {hasData &&
                        endLabels.map((l) => (
                            <text key={l.key} x={xOf(last) + 10} y={l.y} dominantBaseline="middle" fontSize="12" fontWeight="600" fill={INK}>
                                {axisLabel(l.value)}
                            </text>
                        ))}

                    {/* พื้นที่รับเมาส์/นิ้ว กว้างเต็มช่วงของแต่ละเดือน */}
                    {rows.map((r, i) => (
                        <rect
                            key={r.key}
                            x={xOf(i) - (step || innerW) / 2}
                            y={MARGIN.top}
                            width={step || innerW}
                            height={innerH}
                            fill="transparent"
                            data-testid="trend-hit"
                            onMouseEnter={() => setHover(i)}
                            onMouseLeave={() => setHover(null)}
                            onTouchStart={() => setHover(i)}
                        />
                    ))}
                </svg>

                {hovered && (
                    <div
                        role="tooltip"
                        className="pointer-events-none absolute -translate-x-1/2 top-0 rounded-lg bg-white shadow-card ring-1 ring-line px-3 py-2 text-xs whitespace-nowrap flex flex-col gap-0.5"
                        style={{ left: `${Math.min(85, Math.max(15, (xOf(hover) / WIDTH) * 100))}%` }}
                    >
                        <span className="font-medium text-ink">{hovered.label}</span>
                        {SERIES.map((s) => (
                            <span key={s.key} className="flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
                                <span className="text-muted">{s.label}</span>
                                <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">{baht(hovered[s.key])}</span>
                            </span>
                        ))}
                        <span className="flex items-center gap-1.5 border-t border-line pt-1 mt-0.5">
                            <span className="text-muted">คงเหลือ</span>
                            <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">{baht(hovered.net)}</span>
                        </span>
                    </div>
                )}

                {!hasData && <p className="absolute inset-0 grid place-items-center text-sm text-muted pointer-events-none">ยังไม่มีข้อมูลในช่วงนี้</p>}
            </div>

            <details className="text-xs text-muted">
                <summary className="cursor-pointer select-none">ดูเป็นตาราง</summary>
                <table className="mt-2 w-full">
                    <thead>
                        <tr className="text-left">
                            <th className="font-normal py-1">เดือน</th>
                            <th className="font-normal py-1 text-right">รายรับ</th>
                            <th className="font-normal py-1 text-right">รายจ่าย</th>
                            <th className="font-normal py-1 text-right">คงเหลือ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key} className="border-t border-line/60">
                                <td className="py-1">{r.label}</td>
                                <td className="py-1 text-right tabular-nums text-ink">{baht(r.income)}</td>
                                <td className="py-1 text-right tabular-nums text-ink">{baht(r.expense)}</td>
                                <td className="py-1 text-right tabular-nums text-ink">{baht(r.net)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        </figure>
    )
}

export default TrendChart
