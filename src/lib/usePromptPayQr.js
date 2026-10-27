import { useEffect, useState } from 'react'
import { balanceOf } from './billing'
import { generatePromptPayQR } from './promptpay'

// สร้างรูป QR พร้อมเพย์ตามยอดค้างของใบ (ทำเมื่อ enabled = อยู่หน้าชำระเงิน) คืน { qrCodeUrl, qrError }
export function usePromptPayQr(promptpayId, invoice, enabled) {
    const [qrCodeUrl, setQrCodeUrl] = useState(null)
    const [qrError, setQrError] = useState('')

    useEffect(() => {
        if (!invoice || !enabled) return
        generatePromptPayQR(promptpayId, balanceOf(invoice), { width: 480 })
            .then((url) => {
                setQrCodeUrl(url)
                setQrError('')
            })
            .catch((e) => {
                setQrCodeUrl(null)
                setQrError(e.message)
            })
    }, [invoice, enabled, promptpayId])

    return { qrCodeUrl, qrError }
}
