import QRCode from 'qrcode'

// ฟังก์ชันคำนวณ Checksum CRC-16 (CCITT) สำหรับมาตรฐาน EMVCo PromptPay
function crc16(data) {
    let crc = 0xFFFF
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            } else {
                crc = (crc << 1) & 0xFFFF
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0')
}

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '')

// เบอร์มือถือ 10 หลักขึ้นต้น 0 หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก
export function isValidPromptPayId(value) {
    const d = digitsOf(value)
    return (d.length === 10 && d.startsWith('0')) || d.length === 13
}

// 0628954321 -> 062-895-4321, 1234567890123 -> 1-2345-67890-12-3
export function formatPromptPayId(value) {
    const d = digitsOf(value)
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
    if (d.length === 13) return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`
    return String(value ?? '')
}

/**
 * สร้าง PromptPay Payload ตามมาตรฐาน EMVCo / Thai QR Payment
 * @param {string} target - เบอร์โทรศัพท์ (10 หลัก) หรือเลขบัตรประชาชน (13 หลัก)
 * @param {number|string} [amount] - ยอดเงินที่ต้องการระบุ (ถ้ามี)
 * @returns {string} Payload string (ว่างเมื่อรหัสพร้อมเพย์ไม่ถูกต้อง)
 */
export function generatePromptPayPayload(target, amount) {
    if (!isValidPromptPayId(target)) return ''
    const cleanTarget = digitsOf(target)
    const targetType = cleanTarget.length === 13 ? '02' : '01'
    // เบอร์โทรไทยใช้รหัสประเทศ 0066 ตามด้วยเลข 9 หลักท้าย (ตัด 0 นำหน้าออก)
    const formattedTarget = targetType === '01' ? '0066' + cleanTarget.slice(-9) : cleanTarget

    const targetTag = targetType + formattedTarget.length.toString().padStart(2, '0') + formattedTarget
    const merchantInfo = '0016A000000677010111' + targetTag
    const tag29 = '29' + merchantInfo.length.toString().padStart(2, '0') + merchantInfo

    const hasAmount = Number(amount) > 0
    // Point of Initiation Method: 12 = Dynamic QR (ระบุยอด), 11 = Static QR (ไม่ระบุยอด)
    let payload = '000201' + (hasAmount ? '010212' : '010211') + tag29 + '5802TH' + '5303764'

    if (hasAmount) {
        const amtStr = Number(amount).toFixed(2)
        payload += '54' + amtStr.length.toString().padStart(2, '0') + amtStr
    }

    payload += '6304'
    return payload + crc16(payload)
}

/**
 * สร้างรูป QR Code PromptPay ในรูปแบบ Data URL (PNG)
 * @param {string} target - เบอร์โทรศัพท์หรือเลขบัตรประชาชน
 * @param {number|string} [amount] - ยอดเงิน
 * @param {{ width?: number }} [options] - ขนาดรูปเป็นพิกเซล (ค่าเริ่มต้น 300)
 * @returns {Promise<string>} data:image/png;base64,...
 * @throws เมื่อรหัสพร้อมเพย์ไม่ถูกต้อง (ยังไม่ได้ตั้งค่าหรือพิมพ์ผิด)
 */
export async function generatePromptPayQR(target, amount, { width = 300 } = {}) {
    const payload = generatePromptPayPayload(target, amount)
    if (!payload) throw new Error('รหัสพร้อมเพย์ไม่ถูกต้อง (ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก)')
    return QRCode.toDataURL(payload, {
        width,
        margin: 1,
        color: {
            dark: '#0f172a',
            light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
    })
}
