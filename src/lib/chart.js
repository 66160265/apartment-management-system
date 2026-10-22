// ตัวช่วยวาดกราฟ

// ปัดเพดานแกนให้เป็นเลขกลมที่ครึ่งหนึ่งก็ยังกลม (1, 2, 4, 5, 6, 8, 10 x 10^n) แท่งจะได้ไม่เตี้ยเกินเมื่อค่าสูงสุดอยู่ใกล้ต้นขั้น
export function niceMax(max) {
    if (!(max > 0)) return 10
    const pow = 10 ** Math.floor(Math.log10(max))
    return [1, 2, 4, 5, 6, 8, 10].find((s) => max <= s * pow) * pow
}
