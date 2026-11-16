import type { ReactNode } from "react";
import { PlatformTabs } from "@/components/platform/PlatformTabs";
import { PLATFORM_THEME } from "@/lib/platform/theme";

// ธีมเฉพาะหมวด "แพลตฟอร์ม" — บัญชีฝ่ายขายใช้หน้านี้เพื่อ *ทำงาน* (เติมสต็อก ดูออเดอร์)
// จึงใช้เทอร์ควอยซ์เข้มเป็นสีหลัก แยกจากสีแดงของ Dragon19 ที่เน้นแดชบอร์ดให้ผู้บริหารอ่าน
// โครงหน้า: แถวเมนูของหมวด (แถวเดียว เต็มความกว้าง) แล้วจึงเป็นพื้นที่ทำงาน
// ไม่วางเมนูหมวดเป็นคอลัมน์ที่สอง เพราะจะไปชนกับเมนูหลักของระบบและกินความกว้างของตาราง
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <div style={PLATFORM_THEME} className="flex min-w-0 flex-col gap-3">
      <PlatformTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
