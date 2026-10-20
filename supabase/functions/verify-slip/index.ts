// ===========================================================================
// Edge Function: verify-slip  (ตรวจสลิปโอนเงินด้วย EasySlip API v2)
// หน้าที่: อ่านสลิปที่ผู้เช่าแนบกับใบแจ้งหนี้ ส่งให้ EasySlip ตรวจ แล้วบันทึกผลลง invoices.verify_status / verify_detail
//         แอดมินดูผลและกดยืนยันรับเงินเอง (ฟังก์ชันนี้ไม่อนุมัติหรือปฏิเสธสลิปแทนแอดมิน)
// ผู้เรียก: หน้าเว็บหลังผู้เช่าส่งสลิป (src/lib/slipVerify.js) หรือแอดมินกด "ตรวจสลิป" เอง
// ต้องตั้งค่า:  npx supabase secrets set EASYSLIP_API_KEY=<คีย์>   (คีย์ห้ามอยู่ในโค้ดหน้าเว็บหรือในรีโป)
//   ถ้าต้องการให้ EasySlip ตรวจผู้รับด้วย: ลงทะเบียนบัญชีรับเงินของหอพักในแดชบอร์ด EasySlip แล้วตั้ง EASYSLIP_MATCH_ACCOUNT=1
// ถ้าแก้ไฟล์นี้: ต้อง deploy ใหม่ด้วย  npx supabase functions deploy verify-slip
// ต้องรัน supabase/slip-verify.sql ก่อน และตั้งโหมดตรวจเป็น "แนะนำ" ในหน้าตั้งค่า (โหมด "ปิด" ฟังก์ชันนี้ไม่ทำอะไรและไม่เสียโควตา)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ผู้เรียกต้องล็อกอิน
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)

  let invoiceId = ''
  try {
    invoiceId = String((await req.json()).invoice_id ?? '')
  } catch {
    // body ไม่ใช่ JSON ตกไปตรวจด้านล่าง
  }
  if (!UUID.test(invoiceId)) return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400)

  // ตรวจสิทธิ์: แอดมิน หรือเจ้าของใบแจ้งหนี้เท่านั้น
  const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
  const { data: invoice } = await admin.from('invoices').select('id, user_id').eq('id', invoiceId).maybeSingle()
  if (!invoice) return json({ error: 'ไม่พบใบแจ้งหนี้' }, 404)
  if (profile?.role !== 'admin' && invoice.user_id !== caller.user.id) return json({ error: 'ไม่มีสิทธิ์' }, 403)

  // โหมด "ปิด" ไม่ต้องทำอะไร ไม่แตะโควตา
  const { data: settings } = await admin.from('app_settings').select('slip_verify_mode').eq('id', 1).maybeSingle()
  if (settings?.slip_verify_mode !== 'suggest') return json({ status: 'off' })

  const apiKey = Deno.env.get('EASYSLIP_API_KEY')
  if (!apiKey) return json({ status: 'error', message: 'ยังไม่ได้ตั้งค่า EASYSLIP_API_KEY' }, 500)

  // จองสิทธิ์ตรวจ 1 ครั้ง (กดซ้ำ/เรียกพร้อมกัน/ครบ 3 ครั้ง/ไม่ได้รอตรวจ = ไม่ตรวจและไม่เสียโควตา)
  const { data: claimed, error: claimError } = await admin.rpc('claim_slip_verify', { p_invoice: invoiceId })
  if (claimError) return json({ error: `จองสิทธิ์ตรวจไม่สำเร็จ: ${claimError.message}` }, 500)
  const claim = Array.isArray(claimed) ? claimed[0] : claimed
  if (!claim) return json({ status: 'skipped' })

  // จากนี้ไปถ้าพลาดกลางทางต้องปล่อยสถานะ checking ไม่ให้ค้าง
  try {
    const { data: file, error: downloadError } = await admin.storage.from('slips').download(claim.slip_path)
    if (downloadError || !file) throw new Error(`โหลดรูปสลิปไม่สำเร็จ: ${downloadError?.message ?? 'ไม่พบไฟล์'}`)

    if (file.size > MAX_IMAGE_BYTES) {
      const detail = { notes: ['รูปสลิปใหญ่เกิน 4MB ตรวจอัตโนมัติไม่ได้ กรุณาตรวจด้วยตา'] }
      await admin.rpc('apply_slip_result', { p_invoice: invoiceId, p_status: 'skipped', p_detail: detail })
      return json({ status: 'skipped', detail })
    }

    const form = new FormData()
    form.append('image', file, `slip.${String(claim.slip_path).split('.').pop() || 'jpg'}`)
    if (Deno.env.get('EASYSLIP_MATCH_ACCOUNT') === '1') form.append('matchAccount', 'true')

    const res = await fetch(EASYSLIP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(25000),
    })
    const body = await res.json().catch(() => null)

    // บันทึกเฉพาะ "โครงสร้าง" ของคำตอบ (ชื่อฟิลด์ ไม่ใช่ค่า) ไว้ดูใน Logs ตอนทดสอบ เพราะเอกสารของ EasySlip ระบุฟิลด์ไม่ครบ
    const data = body?.data
    console.log('easyslip', res.status, body?.success, body?.error?.code ?? '', Object.keys(data ?? {}).join(','), Object.keys(data?.rawSlip ?? {}).join(','))

    let verdict
    if (!res.ok || !body?.success) {
      verdict = mapEasySlipError(body?.error?.code, body?.error?.message)
    } else {
      const balance = Math.max(0, Number(claim.total) - Number(claim.paid_amount ?? 0))
      verdict = evaluateSlip(parseEasySlip(body), { balance, invoiceCreatedAt: claim.created_at, now: new Date() })
    }

    const { data: finalStatus, error: applyError } = await admin.rpc('apply_slip_result', {
      p_invoice: invoiceId,
      p_status: verdict.status,
      p_detail: verdict.detail,
    })
    if (applyError) throw new Error(applyError.message)
    return json({ status: finalStatus, detail: verdict.detail })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await admin.rpc('mark_slip_error', { p_invoice: invoiceId, p_message: `ตรวจสลิปไม่สำเร็จ: ${message}` })
    return json({ status: 'error', message }, 200)
  }
})
