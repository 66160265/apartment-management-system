// จุดเริ่มต้นของแอป: โหลด CSS แล้ววาดคอมโพเนนต์ App ลงใน <div id="root"> ของ index.html
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'

// BrowserRouter ทำให้ใช้เส้นทางแบบ URL ปกติได้ (/rooms, /invoices ...) StrictMode ช่วยเตือนปัญหาตอนพัฒนา
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
