import type { ReactNode } from "react";
import { SALE_THEME } from "@/lib/sale/theme";
import { SaleTabs } from "@/components/sale/SaleTabs";
import { SalePulseToast } from "@/components/sale/SalePulseToast";

// หมวด "ฝ่ายขาย" (/sale) — เส้นทางแยกจาก /platform ของ Dragon19 โดยสิ้นเชิง
// ธีมเมนูและหัวข้อหน้าของหมวดนี้อยู่ในโฟลเดอร์ของตัวเอง แก้แล้วไม่กระทบหน้าฝั่ง CEO
export default function SaleLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={SALE_THEME}
      className="flex min-w-0 flex-col gap-3 bg-[color:var(--background)] text-[color:var(--foreground)] min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:gap-5"
    >
      <SaleTabs />
      <div className="min-w-0 flex-1">{children}</div>
      {/* ตัวเฝ้าของใหม่: เด้งแจ้งเตือนแม้หน้ากำลังกรองสถานะอื่นอยู่ */}
      <SalePulseToast />
    </div>
  );
}
