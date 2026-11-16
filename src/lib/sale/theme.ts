import type { CSSProperties } from "react";

/**
 * ตัวแปรสีของหมวด "ฝ่ายขาย" (/sale) — แยกจาก PLATFORM_THEME ของหมวดแพลตฟอร์มโดยตั้งใจ
 * บัญชีฝ่ายขายทำงานหน้าร้าน (เติมสต็อก ดูออเดอร์) จึงใช้โทนระบบร้านค้า: พื้นเทาอ่อน การ์ดขาว
 * ฟ้าเดียวเป็นสีหลัก ตัวอักษรไม่มีเชิง และเขียว/แดงใช้เฉพาะเพิ่ม/ลดของ
 * แก้ไฟล์นี้ไม่กระทบหน้า /platform หรือหน้าใดของ Dragon19
 */
export const SALE_THEME = {
  "--background": "#f6f7f9",
  "--foreground": "#111827",
  "--card": "#ffffff",
  "--primary": "#0a6cb8",
  "--primary-foreground": "#ffffff",
  "--ring": "#0a6cb8",
  "--accent": "#e8f2fc",
  "--accent-foreground": "#0b5ea3",
  "--secondary": "#f1f3f5",
  "--secondary-foreground": "#111827",
  "--muted": "#f1f3f5",
  "--muted-foreground": "#6b7280",
  "--border": "#e5e7eb",
  "--radius": "0.5rem",
  "--ok": "#047857",
  "--ok-soft": "#ecfdf5",
  "--danger": "#b42318",
  "--danger-soft": "#fee4e2",
} as CSSProperties;
