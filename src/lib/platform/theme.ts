import type { CSSProperties } from "react";

/**
 * ตัวแปรสีของหมวด "แพลตฟอร์ม" (ใช้ที่ layout และที่ป๊อปอัป)
 * ป๊อปอัปถูกวาดนอกขอบเขตของ layout จึงต้องส่งตัวแปรชุดเดียวกันเข้าไปด้วย
 * ไม่อย่างนั้นปุ่มในป๊อปอัปจะกลับไปใช้สีแดงของธีมหลัก
 */
export const PLATFORM_THEME = {
  "--primary": "#0f6f62",
  "--primary-foreground": "#ffffff",
  "--ring": "#0f6f62",
  "--accent": "#e6f4f1",
  "--accent-foreground": "#0b4f45",
  "--secondary": "#eef2f6",
  "--secondary-foreground": "#0f172a",
  "--radius": "0.5rem",
  // ภาษาสีของหมวดนี้: เขียว = เพิ่ม/รับของ, แดง = ลด/กันของ — ใช้เหมือนกันทุกหน้า
  "--ok": "#0f7b4b",
  "--ok-soft": "#e8f8ee",
  "--danger": "#b42318",
  "--danger-soft": "#fdecea",
} as CSSProperties;
