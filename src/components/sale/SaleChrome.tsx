"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SALE_THEME } from "@/lib/sale/theme";

/**
 * เปลือกบนของบัญชี "ฝ่ายขาย" — แถบสว่างแบบระบบร้านค้า ใช้เฉพาะหมวด /sale
 * ไม่ใช้ร่วมกับแถบของ Dragon19 และไม่แก้ไฟล์ของฝั่งนั้น
 */
export function SaleChrome({ companyName }: { companyName: string }) {
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
      className="sticky top-0 z-40 flex h-[56px] items-center gap-3 border-b border-border bg-card px-4"
    >
      <Link href="/sale" className="text-[13px] font-bold tracking-[0.14em] uppercase hover:opacity-80">
        PCMS
      </Link>
      <span className="hidden text-[12.5px] text-muted-foreground min-[520px]:inline">· {companyName}</span>
      <span className="flex-1" />
      <span className="hidden rounded-full bg-[color:var(--accent)] px-2.5 py-1 text-[11.5px] font-semibold text-[color:var(--accent-foreground)] min-[720px]:inline">
        ฝ่ายขาย
      </span>
      <Button asChild size="sm" variant="outline">
        <Link href="/sale/orders">ออเดอร์</Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/sale/settings">ตั้งค่า</Link>
      </Button>
      <Button size="sm" variant="ghost" onClick={logout} disabled={loggingOut}>
        {loggingOut ? "กำลังออก…" : "ออกจากระบบ"}
      </Button>
    </header>
  );
}
