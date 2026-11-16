import type { CSSProperties, ReactNode } from "react";

// ธีมเฉพาะหมวด "แพลตฟอร์ม" — บัญชีฝ่ายขายใช้หน้านี้เพื่อ *ทำงาน* (เติมสต็อก ดูออเดอร์)
// จึงใช้เทอร์ควอยซ์เข้มเป็นสีหลัก แยกจากสีแดงของ Dragon19 ที่เน้นแดชบอร์ดให้ผู้บริหารอ่าน
// มุมโค้งเล็กลงและระยะชิดขึ้นเพื่อให้ตารางกับปุ่มอยู่ใกล้มือ
// ค่าเหล่านี้ทับ CSS variables เฉพาะ subtree นี้ ไม่กระทบหน้าอื่นของระบบ
const PLATFORM_THEME = {
  "--primary": "#0f6f62",
  "--primary-foreground": "#ffffff",
  "--ring": "#0f6f62",
  "--accent": "#e6f4f1",
  "--accent-foreground": "#0b4f45",
  "--secondary": "#eef2f6",
  "--secondary-foreground": "#0f172a",
  "--radius": "0.5rem",
} as CSSProperties;

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <div style={PLATFORM_THEME}>{children}</div>;
}
