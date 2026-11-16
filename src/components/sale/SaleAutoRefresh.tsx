"use client";

// อัปเดตตัวเลขบนหน้าอัตโนมัติตามรอบที่กำหนด พร้อมนับถอยหลังให้เห็นว่าอีกกี่วินาที
// ใช้ router.refresh() ของ Next เพื่อดึงข้อมูลจากเซิร์ฟเวอร์ใหม่โดยไม่รีโหลดทั้งหน้า

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SaleAutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);
  const [lastAt, setLastAt] = useState<string>("");
  const remainingRef = useRef(seconds);

  useEffect(() => {
    remainingRef.current = seconds;
    setRemaining(seconds);

    const tick = setInterval(() => {
      remainingRef.current -= 1;
      if (remainingRef.current <= 0) {
        // บอกให้ toast รู้ว่า “รอบนี้มาจากการรีเฟรช” ไม่ใช่จากการเปลี่ยนหน้า
        window.dispatchEvent(new CustomEvent("sale:refresh"));
        router.refresh();
        remainingRef.current = seconds;
        setLastAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
      }
      setRemaining(Math.max(0, remainingRef.current));
    }, 1000);

    return () => clearInterval(tick);
  }, [router, seconds]);

  return (
    <span className="text-[11.5px] text-muted-foreground" aria-live="polite">
      อัปเดตอัตโนมัติ · อีก{" "}
      <span className="font-bold tabular-nums text-foreground">{remaining}</span> วินาที
      {lastAt ? ` · ล่าสุด ${lastAt}` : ""}
    </span>
  );
}
