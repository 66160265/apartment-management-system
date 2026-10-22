// ===========================================================================
// Edge Function: verify-slip  (ตรวจสลิปโอนเงินด้วย EasySlip API v2)
// หน้าที่: อ่านสลิปที่ผู้เช่าแนบ ส่งให้ EasySlip ตรวจ แล้วบันทึกผลลง verify_status / verify_detail
//         ใช้ได้ 2 แบบ: สลิปของใบแจ้งหนี้ (ส่ง invoice_id) และสลิปค่าซ่อม (ส่ง payment_id ของตาราง repair_payments)
//         โหมด "แนะนำ": แอดมินดูผลและกดยืนยันรับเงินเอง  โหมด "อัตโนมัติ": ผ่านครบทุกเงื่อนไขแล้วยืนยันรับเงินให้เอง
//         (ดู auto_approve_slip และ auto_approve_repair_payment ในไฟล์ supabase/migrations/20261022000000_initial_schema.sql)
//         ไม่ปฏิเสธสลิปเองเด็ดขาด สลิปที่ไม่เข้าเงื่อนไขรอแอดมินตรวจ
// ผู้เรียก: หน้าเว็บหลังผู้เช่าส่งสลิป (src/lib/slipVerify.js) หรือแอดมินกด "ตรวจสลิป" เอง
// ต้องตั้งค่า:  npx supabase secrets set EASYSLIP_API_KEY=<คีย์>   (คีย์ห้ามอยู่ในโค้ดหน้าเว็บหรือในรีโป)
//   ตรวจผู้รับ: ลงทะเบียนบัญชีรับเงินของหอพักในแดชบอร์ด EasySlip แล้วตั้ง EASYSLIP_MATCH_ACCOUNT=1 (โหมดอัตโนมัติขอตรวจผู้รับเสมอ และจำเป็นต้องมีผลยืนยัน)
// ถ้าแก้ไฟล์นี้: ต้อง deploy ใหม่ด้วย  npx supabase functions deploy verify-slip
// ต้องรันไฟล์ migration (ส่วน slip-verify และ repair-payments) ก่อน และตั้งโหมดตรวจในหน้าตั้งค่า (โหมด "ปิด" ฟังก์ชันนี้ไม่ทำอะไรและไม่เสียโควตา)
// ===========================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import { evaluateSlip, mapEasySlipError, parseEasySlip } from './evaluate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const EASYSLIP_URL = 'https://api.easyslip.com/v2/verify/bank'
// EasySlip รับรูปไม่เกิน 4MB (ถังสลิปของเราให้ 5MB รูปที่ใหญ่กว่านี้จะข้ามการตรวจอัตโนมัติ)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ชื่อฟังก์ชันและพารามิเตอร์ในฐานข้อมูลของแต่ละชนิด (ใบแจ้งหนี้ / ค่าซ่อม)
const KINDS = {
  invoice: {
    param: 'p_invoice',
    claim: 'claim_slip_verify',
    apply: 'apply_slip_result',
    error: 'mark_slip_error',
    auto: 'auto_approve_slip',
  },
  repair: {
    param: 'p_payment',
    claim: 'claim_repair_slip_verify',
    apply: 'apply_repair_slip_result',
    error: 'mark_repair_slip_error',
    auto: 'auto_approve_repair_payment',
  },
} as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ผู้เรียกต้องล็อกอิน
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)

  let body: { invoice_id?: unknown; payment_id?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // body ไม่ใช่ JSON ตกไปตรวจด้านล่าง
  }
  const kind = body.payment_id ? 'repair' : 'invoice'
  const id = String((kind === 'repair' ? body.payment_id : body.invoice_id) ?? '')
  if (!UUID.test(id)) return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400)
  const fn = KINDS[kind]
  const idArg = { [fn.param]: id }

  // ตรวจสิทธิ์: แอดมิน หรือเจ้าของรายการเท่านั้น
  const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
  const { data: owner } = await admin
    .from(kind === 'repair' ? 'repair_payments' : 'invoices')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!owner) return json({ error: kind === 'repair' ? 'ไม่พบรายการชำระค่าซ่อม' : 'ไม่พบใบแจ้งหนี้' }, 404)
  if (profile?.role !== 'admin' && owner.user_id !== caller.user.id) return json({ error: 'ไม่มีสิทธิ์' }, 403)

  // โหมด "ปิด" ไม่ต้องทำอะไร ไม่แตะโควตา
  const { data: settings } = await admin.from('app_settings').select('slip_verify_mode').eq('id', 1).maybeSingle()
  const mode = settings?.slip_verify_mode
  if (mode !== 'suggest' && mode !== 'auto') return json({ status: 'off' })

  const apiKey = Deno.env.get('EASYSLIP_API_KEY')
  if (!apiKey) return json({ status: 'error', message: 'ยังไม่ได้ตั้งค่า EASYSLIP_API_KEY' }, 500)

  // จองสิทธิ์ตรวจ 1 ครั้ง (กดซ้ำ/เรียกพร้อมกัน/ครบ 3 ครั้ง/ไม่ได้รอตรวจ = ไม่ตรวจและไม่เสียโควตา)
  const { data: claimed, error: claimError } = await admin.rpc(fn.claim, idArg)
  if (claimError) return json({ error: `จองสิทธิ์ตรวจไม่สำเร็จ: ${claimError.message}` }, 500)
  const claim = Array.isArray(claimed) ? claimed[0] : claimed
  if (!claim) return json({ status: 'skipped' })

  // จากนี้ไปถ้าพลาดกลางทางต้องปล่อยสถานะ checking ไม่ให้ค้าง
  try {
    const { data: file, error: downloadError } = await admin.storage.from('slips').download(claim.slip_path)
    if (downloadError || !file) throw new Error(`โหลดรูปสลิปไม่สำเร็จ: ${downloadError?.message ?? 'ไม่พบไฟล์'}`)

    if (file.size > MAX_IMAGE_BYTES) {
      const detail = { notes: ['รูปสลิปใหญ่เกิน 4MB ตรวจอัตโนมัติไม่ได้ กรุณาตรวจด้วยตา'] }
      await admin.rpc(fn.apply, { ...idArg, p_status: 'skipped', p_detail: detail })
      return json({ status: 'skipped', detail })
    }

    const form = new FormData()
    form.append('image', file, `slip.${String(claim.slip_path).split('.').pop() || 'jpg'}`)
    if (mode === 'auto' || Deno.env.get('EASYSLIP_MATCH_ACCOUNT') === '1') form.append('matchAccount', 'true')

    const res = await fetch(EASYSLIP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(25000),
    })
    const result = await res.json().catch(() => null)

    // บันทึกเฉพาะ "โครงสร้าง" ของคำตอบ (ชื่อฟิลด์ ไม่ใช่ค่า) ไว้ดูใน Logs ตอนทดสอบ เพราะเอกสารของ EasySlip ระบุฟิลด์ไม่ครบ
    const data = result?.data
    console.log('easyslip', kind, res.status, result?.success, result?.error?.code ?? '', Object.keys(data ?? {}).join(','), Object.keys(data?.rawSlip ?? {}).join(','))

    let verdict
    if (!res.ok || !result?.success) {
      verdict = mapEasySlipError(result?.error?.code, result?.error?.message)
    } else {
      const slip = parseEasySlip(result)
      // ค่าซ่อม: ยอดค่าซ่อมเต็ม (claim คืน paid_amount = 0)
      let balance = Math.max(0, Number(claim.total) - Number(claim.paid_amount ?? 0))
      // ใบแจ้งหนี้: ยอดที่ต้องชำระรวมค่าปรับล่าช้า ณ วันที่โอน (ให้ฐานข้อมูลคำนวณ ใช้สูตรเดียวกับตอนยืนยันรับเงิน)
      // เรียกไม่ได้ (เช่น ยังไม่ได้รันส่วน payments ของไฟล์ migration รุ่นใหม่) ใช้ยอดคงเหลือแบบไม่มีค่าปรับแทน
      if (kind === 'invoice') {
        const { data: due, error: dueError } = await admin.rpc('invoice_balance_at', { p_invoice: id, p_transfer: slip.date })
        if (!dueError && due !== null && due !== undefined && Number.isFinite(Number(due))) balance = Number(due)
      }
      verdict = evaluateSlip(slip, {
        balance,
        invoiceCreatedAt: claim.created_at,
        now: new Date(),
        requireAccountMatch: mode === 'auto',
      })
    }

    const { data: finalStatus, error: applyError } = await admin.rpc(fn.apply, {
      ...idArg,
      p_status: verdict.status,
      p_detail: verdict.detail,
    })
    if (applyError) throw new Error(applyError.message)

    // โหมดอัตโนมัติ: ผลเป็น ok แล้วลองยืนยันรับเงิน ฐานข้อมูลตรวจเงื่อนไขซ้ำเองทั้งหมด (ยอดพอดี ผู้รับยืนยัน สลิปไม่ซ้ำ)
    // ไม่เข้าเงื่อนไข = ไม่ทำอะไร สลิปยังรอแอดมินตรวจ ถ้าขั้นนี้พลาดก็ไม่ถือว่าตรวจสลิปล้มเหลว
    let approved = false
    if (mode === 'auto' && finalStatus === 'ok') {
      const { data: autoResult, error: autoError } = await admin.rpc(fn.auto, idArg)
      if (autoError) console.log(fn.auto, 'error', autoError.message)
      approved = autoResult === 'paid'
    }
    return json({ status: finalStatus, approved, detail: verdict.detail })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await admin.rpc(fn.error, { ...idArg, p_message: `ตรวจสลิปไม่สำเร็จ: ${message}` })
    return json({ status: 'error', message }, 200)
  }
})
