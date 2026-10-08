import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { usernameToEmail } from "../lib/tenantAccount";

const features = [
  { icon: "receipt", title: "ใบแจ้งหนี้และชำระเงิน", text: "ดูยอดค่าเช่า ค่าน้ำ ค่าไฟ และแนบสลิปได้ในระบบ" },
  { icon: "wrench", title: "แจ้งซ่อมและติดตามสถานะ", text: "แจ้งปัญหาในห้องพักและดูความคืบหน้าได้ทันที" },
  { icon: "bell", title: "แจ้งเตือนทันที", text: "รู้ทุกความเคลื่อนไหวของใบแจ้งหนี้และงานซ่อม" },
];

function LoginPage() {
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      // 1. Login ด้วย Supabase Auth
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.includes("@") ? email.trim() : usernameToEmail(email),
          password,
        });

      if (loginError) {
        // 400 = ข้อมูลผิด ส่วนอย่างอื่น (เน็ตหลุด/เซิร์ฟเวอร์ล่ม) ไม่ควรบอกว่ารหัสผิด
        setError(
          loginError.status === 400
            ? "ชื่อผู้ใช้/อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง"
            : "เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง"
        );
        return;
      }

      // 2. ตรวจว่ามี user หรือไม่
      const user = data.user;

      if (!user) {
        setError("ไม่พบข้อมูลผู้ใช้");
        return;
      }

      // 3. ดึง role จาก profiles
      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

      if (profileError || !profile) {
        setError("ไม่พบข้อมูลสิทธิ์ของผู้ใช้");
        await supabase.auth.signOut();
        return;
      }

      // 4. แยกตาม Role
      if (profile.role === "admin") {
        navigate("/admin/dashboard");
        return;
      }

      if (profile.role === "user") {
        navigate("/user/dashboard");
        return;
      }

      // 5. Role ไม่ถูกต้อง
      setError("ไม่พบสิทธิ์ของบัญชีนี้");
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Login Error:", err);
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full h-12 pl-11 pr-4 rounded-xl border border-line bg-sand/50 text-ink outline-none transition-colors focus:border-secondary focus:bg-white focus:ring-4 focus:ring-secondary/15";

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      {/* ฝั่งซ้าย: แนะนำระบบ (ซ่อนบนจอเล็ก) */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-linear-to-br from-primary-deep via-primary-dark to-primary text-white p-12">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-secondary/10" />

        <div className="relative flex items-center gap-3">
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-white/12 ring-1 ring-white/20">
            <Icon name="building" className="w-7 h-7" />
          </span>
          <span className="text-lg font-semibold">ระบบจัดการหอพัก</span>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight">
            จัดการหอพัก
            <br />
            ง่าย ครบ ในที่เดียว
          </h1>
          <p className="mt-4 text-white/75 leading-relaxed">
            สำหรับผู้ดูแลหอพักและผู้เช่า ตั้งแต่ใบแจ้งหนี้ การชำระเงิน ไปจนถึงงานแจ้งซ่อม
          </p>
          <ul className="mt-10 flex flex-col gap-5">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/12 ring-1 ring-white/15 shrink-0">
                  <Icon name={f.icon} className="w-5 h-5" />
                </span>
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="text-sm text-white/65">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">Apartment Management System</p>
      </section>

      {/* ฝั่งขวา: ฟอร์มเข้าสู่ระบบ */}
      <section className="flex items-center justify-center bg-sand px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8 text-primary-dark">
            <span className="grid place-items-center w-11 h-11 rounded-2xl bg-white shadow-card">
              <Icon name="building" className="w-6 h-6 text-primary" />
            </span>
            <span className="text-lg font-semibold">ระบบจัดการหอพัก</span>
          </div>

          <div className="bg-white rounded-3xl shadow-card p-8 sm:p-10">
            <h2 className="text-2xl font-semibold text-primary-dark">เข้าสู่ระบบ</h2>
            <p className="text-sm text-muted mt-1">ยินดีต้อนรับ กรุณากรอกข้อมูลเพื่อเข้าใช้งาน</p>

            {error && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2.5 rounded-xl bg-red-50 ring-1 ring-red-200 text-red-800 text-sm px-4 py-3"
              >
                <Icon name="alert" className="w-5 h-5 mt-px text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className={`${error ? "mt-4" : "mt-8"} flex flex-col gap-5`}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-primary-dark mb-1.5">
                  อีเมล / ชื่อผู้ใช้
                </label>
                <div className="relative">
                  <Icon name="user" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none" />
                  <input
                    id="email"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="เช่น T101 หรืออีเมลผู้ดูแล"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-primary-dark mb-1.5">
                  รหัสผ่าน
                </label>
                <div className="relative">
                  <Icon name="lock" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="กรอกรหัสผ่าน"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    className={`${fieldClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:text-primary-dark hover:bg-mist/40"
                  >
                    <Icon name={showPassword ? "eyeOff" : "eye"} className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-12 mt-1 rounded-xl bg-primary hover:bg-primary-dark disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium shadow-card flex items-center justify-center gap-2"
              >
                {loading && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </form>

            <p className="mt-6 text-xs text-muted text-center leading-relaxed">
              ผู้เช่าใช้ชื่อผู้ใช้ที่ได้รับจากผู้ดูแลหอพัก (เช่น T101)
              <br />
              หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลหอพัก
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LoginPage;
