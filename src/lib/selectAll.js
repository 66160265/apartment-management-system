// Supabase (PostgREST) ตอบกลับไม่เกิน 1,000 แถวต่อคำขอ ถ้าตารางโตเกินนั้นแล้วดึงแบบเดิม ข้อมูลที่เกินจะถูกตัดทิ้งเงียบ ๆ (ยอดรวมผิดโดยไม่มีข้อความเตือน)
// selectAll ดึงทีละหน้าจนครบ buildQuery ต้องสร้าง query ใหม่ทุกครั้ง และควรเรียงด้วยคอลัมน์ที่ไม่ซ้ำ (เช่น .order('id')) ไม่งั้นแถวอาจซ้ำ/ตกหล่นระหว่างหน้า
// คืนรูปแบบเดียวกับ query ปกติ: { data, error }
export const PAGE_SIZE = 1000

export async function selectAll(buildQuery) {
    const rows = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
        if (error) return { data: null, error }
        rows.push(...(data ?? []))
        if ((data?.length ?? 0) < PAGE_SIZE) return { data: rows, error: null }
    }
}
