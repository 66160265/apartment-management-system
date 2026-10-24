// ตรรกะล้วน ๆ ของการอ่านผลจาก EasySlip และประเมินสลิป (ไม่พึ่ง Deno หรือเครือข่าย เพื่อให้ทดสอบด้วย Vitest ได้)
// ใช้โดย index.ts  ผลลัพธ์ status: ok | warn | failed | error ตรงกับ invoices.verify_status ในไฟล์ migration (ส่วน slip-verify)

export type SlipInfo = {
  amount: number | null
  date: string | null
  transRef: string | null
  senderName: string | null
  receiverName: string | null
  // null = ไม่ได้ขอให้ตรวจผู้รับ (ยังไม่ได้ลงทะเบียนบัญชีหอพักใน EasySlip)
  accountMatched: boolean | null
}

export type Verdict = {
  status: 'ok' | 'warn' | 'failed' | 'error'
  detail: Record<string, unknown>
}

// ปัดเป็นสตางค์ กันทศนิยมคลาดเคลื่อน
const cents = (n: number) => Math.round(n * 100)
const baht = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`

// ดึงชื่อภาษาไทยก่อน ถ้าไม่มีใช้ชื่ออังกฤษ (โครงสร้าง account.name อาจเป็นสตริงหรือออบเจ็กต์แยกภาษา)
function pickName(account: any): string | null {
  const name = account?.name
  if (!name) return null
  if (typeof name === 'string') return name
  return name.th ?? name.en ?? null
}

// อ่านข้อมูลสลิปจากคำตอบของ EasySlip v2 อ่านแบบระวัง: ฟิลด์ไหนไม่มีก็เป็น null ไม่ throw
export function parseEasySlip(body: any): SlipInfo {
  const data = body?.data ?? {}
  const raw = data.rawSlip ?? {}
  const amountField = raw.amount
  const amountValue = typeof amountField === 'object' && amountField !== null ? amountField.amount : amountField
  const amount = Number(amountValue)
  const matched = data.matchedAccount
  return {
    amount: Number.isFinite(amount) && amountValue !== null && amountValue !== undefined ? amount : null,
    date: typeof raw.date === 'string' ? raw.date : null,
    transRef: typeof raw.transRef === 'string' && raw.transRef ? raw.transRef : null,
    senderName: pickName(raw.sender?.account),
    receiverName: pickName(raw.receiver?.account),
    accountMatched: matched === undefined ? null : Boolean(matched),
  }
}

// แปลงรหัส error ของ EasySlip เป็นสถานะและข้อความไทย
export function mapEasySlipError(code: string | undefined, message?: string): Verdict {
  switch (code) {
    case 'SLIP_NOT_FOUND':
      return { status: 'failed', detail: { notes: ['ไม่พบ QR ในรูป หรือไม่ใช่สลิปที่ตรวจสอบได้ (รูปอาจไม่ชัด ถูกแก้ไข หรือไม่ใช่สลิปโอนเงิน)'] } }
    case 'SLIP_PENDING':
      return { status: 'error', detail: { notes: ['สลิปธนาคารกรุงเทพยังตรวจไม่ได้ในช่วง 5 นาทีหลังโอน ให้กดตรวจอีกครั้งภายหลัง'] } }
    case 'IMAGE_SIZE_TOO_LARGE':
      return { status: 'error', detail: { notes: ['รูปสลิปใหญ่เกิน 4MB ตรวจอัตโนมัติไม่ได้ กรุณาตรวจด้วยตา'] } }
    case 'INVALID_IMAGE_FORMAT':
    case 'INVALID_IMAGE_TYPE':
      return { status: 'failed', detail: { notes: ['ไฟล์รูปเสียหรือรูปแบบไม่รองรับ'] } }
    case 'QUOTA_EXCEEDED':
      return { status: 'error', detail: { notes: ['โควตาการตรวจสลิปรอบนี้หมดแล้ว กรุณาตรวจด้วยตา'] } }
    case 'RATE_LIMIT_EXCEEDED':
      return { status: 'error', detail: { notes: ['ส่งตรวจถี่เกินไป ลองใหม่อีกครั้งภายหลัง'] } }
    case 'MISSING_API_KEY':
    case 'INVALID_API_KEY':
    case 'BRANCH_INACTIVE':
    case 'SERVICE_BANNED':
    case 'SERVICE_DELETED':
    case 'USER_BANNED':
    case 'IP_NOT_ALLOWED':
      return { status: 'error', detail: { notes: ['ตั้งค่าบริการตรวจสลิปไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ'] } }
    default:
      return { status: 'error', detail: { notes: [`บริการตรวจสลิปขัดข้องชั่วคราว${code ? ` (${code})` : ''}${message ? `: ${message}` : ''}`] } }
  }
}

// ประเมินสลิปเทียบกับใบแจ้งหนี้
// balance = ยอดคงเหลือที่ต้องชำระ, invoiceCreatedAt = เวลาออกบิล, now = เวลาปัจจุบัน
// requireAccountMatch = true ในโหมดอัตโนมัติ: ต้องมีผลยืนยันว่าผู้รับคือบัญชีหอพัก (accountMatched = true) ไม่งั้นเป็น warn
// ผลเป็น ok เมื่อทุกอย่างปกติและยอดตรงกับยอดคงเหลือ เป็น warn เมื่อสลิปจริงแต่มีข้อสังเกตให้แอดมินดู
// สลิปซ้ำตรวจในฐานข้อมูล (apply_slip_result) ไม่ใช่ที่นี่
export function evaluateSlip(slip: SlipInfo, ctx: { balance: number; invoiceCreatedAt: string; now: Date; requireAccountMatch?: boolean }): Verdict {
  const notes: string[] = []
  let status: 'ok' | 'warn' | 'failed' = 'ok'

  if (slip.amount === null) {
    status = 'warn'
    notes.push('อ่านยอดจากสลิปไม่ได้ กรุณาดูจากรูปสลิป')
  } else if (cents(slip.amount) === cents(ctx.balance)) {
    // ตรงพอดี ไม่ต้องมีหมายเหตุ
  } else if (cents(slip.amount) < cents(ctx.balance)) {
    status = 'warn'
    notes.push(`ยอดในสลิป ${baht(slip.amount)} น้อยกว่ายอดคงเหลือ ${baht(ctx.balance)} (ขาด ${baht((cents(ctx.balance) - cents(slip.amount)) / 100)}) ผู้เช่าต้องโอนส่วนที่เหลือเพิ่ม`)
  } else {
    status = 'warn'
    notes.push(`ยอดในสลิป ${baht(slip.amount)} มากกว่ายอดคงเหลือ ${baht(ctx.balance)} (เกิน ${baht((cents(slip.amount) - cents(ctx.balance)) / 100)}) ต้องโอนคืนผู้เช่า`)
  }

  if (slip.date) {
    const at = new Date(slip.date)
    const created = new Date(ctx.invoiceCreatedAt)
    if (Number.isNaN(at.getTime())) {
      status = 'warn'
      notes.push('อ่านวันที่โอนจากสลิปไม่ได้')
    } else if (at.getTime() > ctx.now.getTime() + 5 * 60 * 1000) {
      status = 'warn'
      notes.push('วันที่โอนในสลิปอยู่ในอนาคต')
    } else if (!Number.isNaN(created.getTime()) && at.getTime() < created.getTime() - 24 * 60 * 60 * 1000) {
      status = 'warn'
      notes.push('วันที่โอนในสลิปเก่ากว่าวันออกใบแจ้งหนี้ อาจเป็นสลิปของรายการอื่น')
    }
  } else {
    status = 'warn'
    notes.push('อ่านวันที่โอนจากสลิปไม่ได้')
  }

  if (slip.accountMatched === false) {
    status = 'warn'
    notes.push('ผู้รับเงินในสลิปไม่ตรงกับบัญชีของหอพัก')
  } else if (ctx.requireAccountMatch && slip.accountMatched !== true) {
    status = 'warn'
    notes.push('ยังยืนยันผู้รับเงินไม่ได้ (ต้องลงทะเบียนบัญชีหอพักใน EasySlip) จึงไม่อนุมัติอัตโนมัติ')
  }
  if (!slip.transRef) {
    status = 'warn'
    notes.push('ไม่พบเลขอ้างอิงของสลิป ตรวจสลิปซ้ำไม่ได้')
  }

  return {
    status,
    detail: {
      amount: slip.amount,
      date: slip.date,
      transRef: slip.transRef,
      sender: slip.senderName,
      receiver: slip.receiverName,
      accountMatched: slip.accountMatched,
      notes,
    },
  }
}
