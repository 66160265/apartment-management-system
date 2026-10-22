import { useState } from 'react'
import { niceMax } from '../lib/chart'

// กราฟแท่งรายเดือน ซีรีส์เดียว (เช่น หน่วยน้ำ หรือหน่วยไฟ) วาดด้วย SVG ไม่ใช้ไลบรารี
// rows = [{ key, label, value }] เรียงจากเก่าไปใหม่ color = สีแท่ง unit = หน่วยที่แสดงใน tooltip/ตาราง
// หลักการวาด: แท่งหนาไม่เกิน 24px ปลายบนมน 4px ฐานเรียบ เส้นตารางบางและจาง ใส่ตัวเลขเฉพาะเดือนล่าสุด ที่เหลืออ่านจาก tooltip หรือตาราง

const WIDTH = 640
const HEIGHT = 200
const MARGIN = { top: 22, right: 12, bottom: 26, left: 44 }
const MAX_BAR = 24
const RADIUS = 4

// แท่งที่ปลายบนมน ฐานเรียบ (ความสูง 0 ไม่วาด)
function barPath(x, top, width, bottom) {
    const h = bottom - top
    if (h <= 0) return ''
    const r = Math.min(RADIUS, h, width / 2)
    return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${bottom} Z`
}

const fmt = (n) => Number(n).toLocaleString('th-TH')

function MonthlyColumns({ title, unit = 'หน่วย', color, rows }) {
    const [hover, setHover] = useState(null)

    const innerW = WIDTH - MARGIN.left - MARGIN.right
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
    const max = niceMax(Math.max(0, ...rows.map((r) => r.value)))
    const band = innerW / Math.max(1, rows.length)
    const barW = Math.min(MAX_BAR, band * 0.6)
    const yOf = (v) => MARGIN.top + innerH - (v / max) * innerH
    const baseline = MARGIN.top + innerH
    const ticks = [0, max / 2, max]
    const last = rows.length - 1
    const hasData = rows.some((r) => r.value > 0)

    return (
        <figure className="flex flex-col gap-2 m-0">
            <figcaption className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-primary-dark">{title}</span>
                <span className="text-xs text-muted">{unit}ต่อเดือน</span>
            </figcaption>

            <div className="relative">
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="w-full h-auto"
                    role="img"
                    aria-label={`${title} ${rows.length} เดือน ล่าสุด ${rows[last] ? `${fmt(rows[last].value)} ${unit}` : 'ไม่มีข้อมูล'}`}
                >
                    {/* เส้นตารางและตัวเลขบนแกน (บาง จาง ไม่ประ) */}
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yOf(t)} y2={yOf(t)} stroke="#e7e5e0" strokeWidth="1" />
                            <text x={MARGIN.left - 8} y={yOf(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#6b6a66">
                                {fmt(t)}
                            </text>
                        </g>
                    ))}

                    {rows.map((r, i) => {
                        const cx = MARGIN.left + band * i + band / 2
                        const x = cx - barW / 2
                        const active = hover === i
                        return (
                            <g key={r.key}>
                                {r.value > 0 && <path d={barPath(x, yOf(r.value), barW, baseline)} fill={color} opacity={hover === null || active ? 1 : 0.55} />}
                                {/* ตัวเลขของเดือนล่าสุดบนหัวแท่ง (ข้อความใช้สีตัวอักษร ไม่ใช้สีของซีรีส์) */}
                                {i === last && r.value > 0 && (
                                    <text x={cx} y={yOf(r.value) - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0b0b0b">
                                        {fmt(r.value)}
                                    </text>
                                )}
                                {/* ป้ายเดือน แสดงเว้นเดือน กันตัวอักษรชนกันบนจอเล็ก (ทุกเดือนดูได้ในตาราง) */}
                                {(last - i) % 2 === 0 && (
                                    <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill="#6b6a66">
                                        {r.label}
                                    </text>
                                )}
                                {/* พื้นที่รับเมาส์/นิ้วกว้างกว่าแท่ง เต็มความสูงของกราฟ */}
                                <rect
                                    x={MARGIN.left + band * i}
                                    y={MARGIN.top}
                                    width={band}
                                    height={innerH}
                                    fill="transparent"
                                    data-testid="hit"
                                    onMouseEnter={() => setHover(i)}
                                    onMouseLeave={() => setHover(null)}
                                    onTouchStart={() => setHover(i)}
                                />
                            </g>
                        )
                    })}
                </svg>

                {hover !== null && rows[hover] && (
                    <div
                        role="tooltip"
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-white shadow-card ring-1 ring-line px-3 py-1.5 text-xs whitespace-nowrap"
                        style={{
                            left: `${((MARGIN.left + band * hover + band / 2) / WIDTH) * 100}%`,
                            top: `${(Math.max(yOf(rows[hover].value), MARGIN.top + 14) / HEIGHT) * 100}%`,
                        }}
                    >
                        <span className="text-muted">{rows[hover].label} · </span>
                        <span className="font-semibold text-ink tabular-nums">{fmt(rows[hover].value)} {unit}</span>
                    </div>
                )}

                {!hasData && (
                    <p className="absolute inset-0 grid place-items-center text-sm text-muted pointer-events-none">ยังไม่มีข้อมูลในช่วงนี้</p>
                )}
            </div>

            <details className="text-xs text-muted">
                <summary className="cursor-pointer select-none">ดูเป็นตาราง</summary>
                <table className="mt-2 w-full">
                    <thead>
                        <tr className="text-left">
                            <th className="font-normal py-1">เดือน</th>
                            <th className="font-normal py-1 text-right">{unit}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key} className="border-t border-line/60">
                                <td className="py-1">{r.label}</td>
                                <td className="py-1 text-right tabular-nums text-ink">{fmt(r.value)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        </figure>
    )
}

export default MonthlyColumns
