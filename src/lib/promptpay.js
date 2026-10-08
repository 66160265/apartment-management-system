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

/**
 * สร้าง PromptPay Payload ตามมาตรฐาน EMVCo
 * @param {string} target - เบอร์โทรศัพท์ (10 หลัก) หรือเลขบัตรประชาชน (13 หลัก)
 * @param {number|string} [amount] - ยอดเงินที่ต้องการระบุ (ถ้ามี)
 * @returns {string} Payload string
 */
function generatePromptPayPayload(target, amount) {
    if (!target) return ''
    const cleanTarget = target.replace(/[^0-9]/g, '')
    const targetType = cleanTarget.length >= 13 ? '02' : '01'
    let formattedTarget = cleanTarget

    if (targetType === '01') {
        // เบอร์โทรศัพท์ไทยในระบบ EMVCo ใช้รหัสประเทศ 0066 ตามด้วยเลข 9 หลักท้าย (ตัด 0 นำหน้าออก)
        formattedTarget = '0066' + cleanTarget.slice(-9)
    }

    const targetTag = targetType + formattedTarget.length.toString().padStart(2, '0') + formattedTarget
    const merchantInfo = '0016A000000677010111' + targetTag
    const tag29 = '29' + merchantInfo.length.toString().padStart(2, '0') + merchantInfo

    // Point of Initiation Method: 010212 ถ้ามียอดเงินเจาะจง (Dynamic QR), 010211 ถ้าไม่มียอด (Static QR)
    let payload = '000201' + (amount ? '010212' : '010211') + tag29 + '5802TH' + '5303764'

    if (amount && Number(amount) > 0) {
        const amtStr = Number(amount).toFixed(2)
        payload += '54' + amtStr.length.toString().padStart(2, '0') + amtStr
    }

    payload += '6304'
    const checksum = crc16(payload)
    return payload + checksum
}

/**
 * สร้างรูป QR Code PromptPay ในรูปแบบ Data URL (Base64)
 * @param {string} target - เบอร์โทรศัพท์หรือเลขบัตรประชาชน
 * @param {number|string} [amount] - ยอดเงิน
 * @returns {Promise<string>} data:image/png;base64,...
 */
export async function generatePromptPayQR(target, amount) {
    const payload = generatePromptPayPayload(target, amount)
    if (!payload) return null
    return QRCode.toDataURL(payload, {
        width: 300,
        margin: 1,
        color: {
            dark: '#0f172a',
            light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
    })
}
