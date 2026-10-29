import { thaiDateOf } from './billing'
import { supabase } from './supabaseClient'

// เตือนผู้ดูแลให้ออกบิล: ถึงวันออกบิล (ตั้งในหน้าตั้งค่า) และยังมีห้องที่ยังไม่ได้ออกบิลของเดือนที่แล้ว ฐานข้อมูลส่งแจ้งเตือนให้ผู้ดูแลทุกคนเดือนละครั้ง
// (ฟังก์ชัน billing_day_reminder ใน supabase/migrations/20261027000000_billing_day.sql) ปกติ pg_cron เป็นคนเรียกทุกเช้า
// แต่ถ้าไม่ได้เปิด pg_cron หรือวันนั้นไม่มีใครเปิดเว็บ ก็ใช้ตอนผู้ดูแลเปิดเว็บแทน ส่งซ้ำไม่ได้ ฐานข้อมูลจำว่าเตือนเดือนไหนไปแล้ว

const STORAGE_KEY = 'billingReminderCheckedOn'

// localStorage ใช้ไม่ได้ (โหมดส่วนตัว/ปิดการเก็บข้อมูล) ก็ทำงานต่อได้ แค่ตรวจบ่อยขึ้น
function readChecked() {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
function writeChecked(day) {
    try { localStorage.setItem(STORAGE_KEY, day) } catch { /* ไม่เป็นไร */ }
}

// ตรวจวันละไม่เกินหนึ่งครั้งต่อเบราว์เซอร์ คืน true ถ้าครั้งนี้ฐานข้อมูลส่งแจ้งเตือน (ผู้ดูแลจะเห็นผ่านกระดิ่งแบบ real-time)
// เรียกไม่สำเร็จ (เช่น เน็ตหลุด) = ข้ามเงียบ ๆ ไม่กระทบการใช้งาน และลองใหม่ครั้งหน้า
export async function checkBillingReminder(now = new Date()) {
    const today = thaiDateOf(now)
    if (readChecked() === today) return false
    const { data, error } = await supabase.rpc('billing_day_reminder')
    if (error) return false
    writeChecked(today)
    return data === true
}
