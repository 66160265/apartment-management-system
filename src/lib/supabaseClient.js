import { createClient } from '@supabase/supabase-js'

// อ่าน URL และ publishable key ของโปรเจกต์ Supabase จากไฟล์ .env (ฝังตอน build)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Supabase client ตัวเดียวที่ทั้งแอปใช้เรียก Auth, ฐานข้อมูล, Storage, Realtime และ Edge Functions
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)