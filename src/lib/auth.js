// หน้าแรกของแต่ละสิทธิ์
export const homeFor = (role) => (role === 'admin' ? '/admin/dashboard' : '/user/dashboard')
