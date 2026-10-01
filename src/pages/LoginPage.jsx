import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

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
          email: email.trim(),
          password,
        });

      if (loginError) {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
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

      console.log("User:", user);
      console.log("Profile:", profile);
      console.log("Profile Error:", profileError);

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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        minHeight: "100vh",

        // Background
        backgroundColor: "#F2EFE7",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        zIndex: 9999,

        fontFamily: 'Arial, "Noto Sans Thai", sans-serif',
        color: "#263238",
        textAlign: "left",
      }}
    >
      {/* Login Card */}
      <div
        style={{
          width: "500px",
          minHeight: "430px",

          backgroundColor: "#FFFFFF",

          borderRadius: "18px",

          padding: "36px 42px",

          boxSizing: "border-box",

          // Shadow
          boxShadow: "0 12px 35px rgba(51, 104, 160, 0.15)",

          // Top accent
          borderTop: "5px solid #3368A0",
        }}
      >
        {/* Title */}
        <div
          style={{
            textAlign: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              padding: 0,

              fontSize: "28px",
              lineHeight: "34px",
              fontWeight: 700,

              color: "#3368A0",

              fontFamily: 'Arial, "Noto Sans Thai", sans-serif',
            }}
          >
            ระบบจัดการหอพัก
          </h1>

          <p
            style={{
              margin: "7px 0 0 0",
              padding: 0,

              fontSize: "15px",
              lineHeight: "19px",
              fontWeight: 400,

              color: "#66A3BF",
            }}
          >
            Apartment Management System
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            style={{
              marginTop: "18px",
              marginBottom: "18px",

              width: "100%",
              minHeight: "52px",

              padding: "8px 12px",

              boxSizing: "border-box",

              backgroundColor: "#FDECEC",
              border: "1px solid #E7A5A5",
              borderRadius: "8px",

              color: "#8B3A3A",

              fontSize: "14px",
              lineHeight: "18px",

              textAlign: "center",

              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div>อีเมลหรือรหัสผ่านไม่ถูกต้อง</div>
            <div>กรุณาใส่อีกครั้ง</div>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: error ? "0px" : "32px",
          }}
        >
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",

                marginBottom: "7px",

                fontSize: "15px",
                lineHeight: "19px",

                fontWeight: 500,

                color: "#3368A0",
              }}
            >
              อีเมล
            </label>

            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              style={{
                width: "100%",
                height: "42px",

                padding: "0 12px",

                boxSizing: "border-box",

                border: "1px solid #C8DFDB",
                borderRadius: "8px",

                outline: "none",

                backgroundColor: "#F2EFE7",

                color: "#263238",

                fontSize: "15px",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Password */}
          <div
            style={{
              marginTop: "25px",
            }}
          >
            <label
              htmlFor="password"
              style={{
                display: "block",

                marginBottom: "7px",

                fontSize: "15px",
                lineHeight: "19px",

                fontWeight: 500,

                color: "#3368A0",
              }}
            >
              รหัสผ่าน
            </label>

            {/* Password Input */}
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              style={{
                width: "100%",
                height: "42px",

                padding: "0 12px",

                boxSizing: "border-box",

                border: "1px solid #C8DFDB",
                borderRadius: "8px",

                outline: "none",

                backgroundColor: "#F2EFE7",

                color: "#263238",

                fontSize: "15px",
                fontFamily: "inherit",
              }}
            />

            {/* Show Password */}
            <div
              style={{
                display: "flex",
                alignItems: "center",

                marginTop: "15px",
              }}
            >
              <input
                id="showPassword"
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                style={{
                  width: "17px",
                  height: "17px",

                  margin: 0,
                  padding: 0,

                  accentColor: "#3368A0",

                  cursor: "pointer",
                }}
              />

              <label
                htmlFor="showPassword"
                style={{
                  marginLeft: "7px",

                  fontSize: "14px",
                  lineHeight: "18px",

                  color: "#4F5B62",

                  cursor: "pointer",
                }}
              >
                แสดงรหัสผ่าน
              </label>
            </div>
          </div>

          {/* Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              height: "42px",

              marginTop: "24px",

              padding: 0,

              border: "none",
              borderRadius: "8px",

              backgroundColor: loading ? "#9DB8C5" : "#3368A0",

              color: "#FFFFFF",

              fontSize: "15px",
              fontWeight: 600,

              fontFamily: "inherit",

              cursor: loading ? "not-allowed" : "pointer",

              boxShadow: loading
                ? "none"
                : "0 5px 12px rgba(51, 104, 160, 0.25)",
            }}
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;