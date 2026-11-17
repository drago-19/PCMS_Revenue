"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SALE_THEME } from "@/lib/sale/theme";
import { SaleTabs } from "@/components/sale/SaleTabs";

/**
 * เปลือกบนของบัญชี "ฝ่ายขาย" — แถบสว่างแบบระบบร้านค้า ใช้เฉพาะหมวด /sale
 * ไม่ใช้ร่วมกับแถบของ Dragon19 และไม่แก้ไฟล์ของฝั่งนั้น
 */
export function SaleChrome() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  };

  return (
    // แถบนี้อยู่นอกตัวครอบธีมของ /sale จึงต้องส่งชุดสีเข้าไปเอง ไม่งั้นจะได้สีของ Dragon19
    <header
      style={SALE_THEME}
      className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-1.5 min-[560px]:h-[56px] min-[560px]:flex-nowrap min-[560px]:gap-3 min-[560px]:px-4 min-[560px]:py-0"
    >
      <Link href="/sale" className="text-[13px] font-bold tracking-[0.14em] uppercase hover:opacity-80">
        PCMS
      </Link>
      {/* เมนู 3 หมวดอยู่ในแถบหัวเลย — ไม่ต้องมีแถบข้างแยกอีก */}
      <SaleTabs />
      <span className="hidden flex-1 min-[420px]:block" />
      <span className="hidden rounded-full bg-[color:var(--accent)] px-2.5 py-1 text-[11.5px] font-semibold text-[color:var(--accent-foreground)] min-[720px]:inline">
        ฝ่ายขาย
      </span>
      {/* ไม่มีกรอบ — ให้เข้าพวกกับเมนูข้อความและการออกจากระบบในแถบเดียวกัน */}
      <Button asChild size="sm" variant="ghost" className="hidden min-[560px]:inline-flex">
        <Link href="/sale/settings">ตั้งค่า</Link>
      </Button>
      <Button size="sm" variant="ghost" onClick={logout} disabled={loggingOut}>
        {loggingOut ? (
          "กำลังออก…"
        ) : (
          <>
            <span className="min-[560px]:hidden">ออก</span>
            <span className="hidden min-[560px]:inline">ออกจากระบบ</span>
          </>
        )}
      </Button>
    </header>
  );
}
