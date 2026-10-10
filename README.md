# ระบบจัดการหอพัก (Apartment Management System)

เว็บแอปสำหรับผู้ดูแลหอพักและผู้เช่า จัดการห้องพัก ผู้เช่า ใบแจ้งหนี้และการชำระเงินด้วยสลิป แจ้งซ่อม และแจ้งเตือนในระบบ

## ฟีเจอร์

**ผู้ดูแลระบบ (admin)**
- ภาพรวม: รายได้ ยอดค้างชำระ และสถิติการใช้น้ำ-ไฟรายเดือน
- ห้องพัก: ดู เพิ่ม แก้ไขสถานะและค่าเช่า
- ผู้เช่า: เพิ่มผู้เช่า (สร้างบัญชีให้อัตโนมัติ) ดู/แก้ไขข้อมูล สถานะสัญญา จัดการเอกสารผู้เช่า และลบผู้เช่า
- ใบแจ้งหนี้: บันทึกมิเตอร์ สร้าง/แก้ไข/ลบใบแจ้งหนี้ ตรวจสลิปแล้วอนุมัติหรือปฏิเสธ
- แจ้งซ่อม: รับเรื่อง เปลี่ยนสถานะ และส่งข้อความถึงผู้เช่า
- บัญชีผู้ใช้: รีเซ็ตรหัสผ่าน แก้ไข และลบบัญชี
- ตั้งค่า: ข้อมูลหอพัก บัญชีรับชำระ/พร้อมเพย์ วันครบกำหนด และอัตราค่าบริการเริ่มต้น

**ผู้เช่า (user)**
- ภาพรวมห้องและค่าใช้จ่ายประจำเดือน ชำระเงินด้วย QR PromptPay (ระบุยอดตามใบแจ้งหนี้) และแนบสลิป
- ดาวน์โหลดใบแจ้งหนี้เป็นไฟล์ PDF ได้ทันที (ผู้ดูแลดาวน์โหลดได้เช่นกัน)
- ใบแจ้งหนี้ของตัวเอง แจ้งซ่อมและติดตามสถานะ แจ้งเตือน และเปลี่ยนรหัสผ่าน

ชื่อผู้ใช้ของผู้เช่าคือ `T` ตามด้วยเลขห้อง (เช่น `T101`) รหัสผ่านเริ่มต้นคือ `TP` + เลขห้อง + เลขท้ายเบอร์โทร 4 ตัว (เช่น `TP1010123`)

## เทคโนโลยี

- **Frontend:** React 19, React Router 7, Tailwind CSS 4, Vite 8 (JavaScript)
- **Backend:** Supabase (Auth, PostgreSQL + Row Level Security, Storage, Edge Functions บน Deno)
- **อื่น ๆ:** `qrcode` สร้าง QR PromptPay, `jspdf` + `html-to-image` สร้างไฟล์ PDF ใบแจ้งหนี้ (โหลดเมื่อกดดาวน์โหลดเท่านั้น)

## เริ่มต้นใช้งาน

```bash
npm install
```

สร้างไฟล์ `.env` ที่โฟลเดอร์ราก (ไฟล์นี้ไม่ถูกเก็บใน git):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
# ถ้าต้องการเปลี่ยนโดเมนอีเมลภายในที่ใช้แทนชื่อผู้ใช้ (ต้องตรงกับ Edge Function)
# VITE_USERNAME_EMAIL_DOMAIN=apartment.app
```

รันโหมดพัฒนา:

```bash
npm run dev
```

คำสั่งอื่น: `npm run build` (สร้างไฟล์สำหรับใช้งานจริง), `npm run lint` (ตรวจโค้ด), `npm run preview`

## ตั้งค่า Supabase

1. รันไฟล์ SQL ใน **SQL Editor** ตามลำดับนี้ (รันซ้ำได้):
   `supabase/schema.sql` → `supabase/invoices.sql` → `supabase/repairs.sql` → `supabase/tenant-documents.sql` → `supabase/notifications.sql` → `supabase/settings.sql`
2. สร้างบัญชีแอดมินคนแรกที่ **Authentication → Users** แล้วเพิ่มแถวใน `profiles` (`id` = id ของผู้ใช้, `role` = `admin`)
3. ปิดการยืนยันอีเมล (Authentication → Providers → Email → Confirm email) หรือใช้ Edge Function ซึ่งยืนยันให้อัตโนมัติ
4. Deploy Edge Functions:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase functions deploy create-tenant
npx supabase functions deploy admin-users
```

5. เข้าสู่ระบบด้วยแอดมินแล้วไปที่เมนู **ตั้งค่า** กรอกข้อมูลหอพัก บัญชีธนาคาร **รหัสพร้อมเพย์จริง** (เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก) วันครบกำหนด และอัตราค่าน้ำ-ไฟ แล้วลองสแกน QR ทดสอบด้วยแอปธนาคารว่าชื่อบัญชีปลายทางถูกต้อง

## Deploy บน Vercel

1. นำ repo เข้า Vercel (Add New → Project → Import) ระบบตรวจจับ Vite ให้เอง (Build: `npm run build`, Output: `dist`)
2. เพิ่ม Environment Variables: `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY` (ถ้าเปลี่ยนโดเมนอีเมลภายใน ให้เพิ่ม `VITE_USERNAME_EMAIL_DOMAIN` ด้วย) แล้วกด Deploy — ห้ามใส่ service role key
3. ที่ Supabase → Authentication → URL Configuration ตั้ง Site URL และ Redirect URLs เป็นลิงก์ของ Vercel
4. ไฟล์ `vercel.json` ตั้งให้ทุกเส้นทางส่งกลับ `index.html` เพื่อให้รีเฟรชหน้าอย่าง `/rooms` ได้ ไม่ขึ้น 404

ค่า env ฝังตอน build ถ้าแก้ค่าบน Vercel ต้องกด Redeploy

## โครงสร้างโปรเจกต์

```
src/
  components/   คอมโพเนนต์ที่ใช้ร่วมกัน (เมนูข้าง หัวหน้า ไอคอน ตัวเลือกวันที่/เดือน ฯลฯ)
  pages/        หน้าหลักแต่ละหน้า
  lib/          ตัวช่วย (Supabase client, การคำนวณใบแจ้งหนี้, สิทธิ์ผู้ใช้, แจ้งเตือน)
  data/         ค่าคงที่ (เมนู, อัตราค่าบริการ, ข้อความแจ้งเตือน)
supabase/
  *.sql         โครงสร้างตาราง สิทธิ์ (RLS) และที่เก็บไฟล์
  functions/    Edge Functions (create-tenant, admin-users)
```

## การทำงานร่วมกัน

แยก branch ต่อหนึ่งงาน (`feature/...`) ก่อน push ให้ดึง `developer` ล่าสุดมารวมก่อนเสมอ (`git fetch && git merge origin/developer`) แล้วเปิด Pull Request เข้า `developer` หากไฟล์ `package.json` เปลี่ยน ให้รัน `npm install` ใหม่
