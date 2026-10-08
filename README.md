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

**ผู้เช่า (user)**
- ภาพรวมห้องและค่าใช้จ่ายประจำเดือน ชำระเงินด้วย QR PromptPay และแนบสลิป
- ใบแจ้งหนี้ของตัวเอง แจ้งซ่อมและติดตามสถานะ แจ้งเตือน และเปลี่ยนรหัสผ่าน

ชื่อผู้ใช้ของผู้เช่าคือ `T` ตามด้วยเลขห้อง (เช่น `T101`) รหัสผ่านเริ่มต้นคือ `TP` + เลขห้อง + เลขท้ายเบอร์โทร 4 ตัว (เช่น `TP1010123`)

## เทคโนโลยี

- **Frontend:** React 19, React Router 7, Tailwind CSS 4, Vite 8 (JavaScript)
- **Backend:** Supabase (Auth, PostgreSQL + Row Level Security, Storage, Edge Functions บน Deno)
- **อื่น ๆ:** `qrcode` สร้าง QR PromptPay

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
   `supabase/schema.sql` → `supabase/invoices.sql` → `supabase/repairs.sql` → `supabase/tenant-documents.sql` → `supabase/notifications.sql`
2. สร้างบัญชีแอดมินคนแรกที่ **Authentication → Users** แล้วเพิ่มแถวใน `profiles` (`id` = id ของผู้ใช้, `role` = `admin`)
3. ปิดการยืนยันอีเมล (Authentication → Providers → Email → Confirm email) หรือใช้ Edge Function ซึ่งยืนยันให้อัตโนมัติ
4. Deploy Edge Functions:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase functions deploy create-tenant
npx supabase functions deploy admin-users
```

5. ปรับข้อมูลบัญชีรับโอนและอัตราค่าน้ำ-ไฟเริ่มต้นใน `src/data/billing.js`

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
