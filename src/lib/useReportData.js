import { useCallback, useEffect, useState } from 'react'
import { useRealtimeReload } from './realtime'
import { selectAll } from './selectAll'
import { supabase } from './supabaseClient'

// โหลดข้อมูลที่หน้ารายงาน (pages/ReportsPage.jsx) ใช้ทั้งหมด และโหลดซ้ำเมื่อข้อมูลในฐานข้อมูลเปลี่ยน
// คืน { data, loading, error, now, reload } now = เวลาที่ใช้คิดค่าปรับของยอดค้าง จำไว้ตอนโหลด (ไม่ให้ตัวเลขเปลี่ยนเองระหว่างดู)

const emptyData = { rooms: [], invoices: [], invoicePayments: [], repairPayments: [], moveOuts: [], repairs: [], tenants: [], expenses: [] }

// ดึงข้อมูลทั้งหมดพร้อมกัน
const fetchAll = () =>
    Promise.all([
        supabase.from('rooms').select('number, status, rent'),
        selectAll(() => supabase.from('invoices').select('*').order('id')),
        selectAll(() => supabase.from('invoice_payments').select('*').order('id')),
        // ตารางนี้มีเมื่อรัน ส่วน repair-payments ของไฟล์ migration แล้ว ถ้ายังไม่มีให้ถือว่าไม่มีรายรับค่าซ่อม
        selectAll(() => supabase.from('repair_payments').select('*').in('status', ['review', 'paid']).order('id')),
        // ตารางนี้มีเมื่อรัน ส่วน move-out ของไฟล์ migration แล้ว
        selectAll(() => supabase.from('move_outs').select('*').order('move_out_date', { ascending: false }).order('id')),
        // เรื่องแจ้งซ่อม (ใช้ทำสถิติยอดซ่อม)
        selectAll(() => supabase.from('repairs').select('id, room, user_id, problem, category, status, cost, cost_payer, created_at, completed_at, pay_due_date, late_fee_rate, late_fee_grace, late_fee_cap').order('id')),
        // ผู้เช่าปัจจุบัน (ใช้ดูสัญญาที่ใกล้หมด)
        supabase.from('tenants').select('room, name, end_date'),
        // ค่าใช้จ่ายของหอพัก (ตารางมีเมื่อรัน migration 20261025000000 แล้ว ยังไม่มี = ไม่มีค่าใช้จ่าย)
        selectAll(() => supabase.from('expenses').select('*').order('id')),
    ])

export function useReportData() {
    const [data, setData] = useState(emptyData)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [now, setNow] = useState(() => new Date())

    const apply = useCallback(([rooms, invoices, payments, repairPayments, moveOuts, repairs, tenants, expenses]) => {
        const err = rooms.error || invoices.error
        if (err) {
            setError(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`)
        } else {
            setData({
                rooms: rooms.data,
                invoices: invoices.data,
                // ตารางรับเงินยังไม่มี (ยังไม่ได้รัน ส่วน payments ของไฟล์ migration) ให้รายงานแสดงเท่าที่มี
                invoicePayments: payments.error ? [] : payments.data,
                repairPayments: repairPayments.error ? [] : repairPayments.data,
                moveOuts: moveOuts.error ? [] : moveOuts.data,
                repairs: repairs.error ? [] : repairs.data,
                tenants: tenants.error ? [] : tenants.data,
                expenses: expenses.error ? [] : expenses.data,
            })
            setNow(new Date())
            setError('')
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        let active = true
        fetchAll().then((results) => active && apply(results))
        return () => {
            active = false
        }
    }, [apply])

    // โหลดใหม่ (ใช้หลังเพิ่ม/ลบค่าใช้จ่าย)
    const reload = () => fetchAll().then(apply)

    // อัปเดตเองเมื่อมีการเปลี่ยนใบแจ้งหนี้ การรับเงิน ค่าซ่อม เรื่องแจ้งซ่อม การย้ายออก หรือห้อง
    useRealtimeReload(['invoices', 'invoice_payments', 'repair_payments', 'repairs', 'move_outs', 'rooms', 'tenants', 'expenses'], reload)

    return { data, loading, error, now, reload }
}
