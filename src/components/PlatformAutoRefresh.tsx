"use client";

// อัปเดตตัวเลขบนแดชบอร์ดอัตโนมัติทุก 60 วินาที
// ใช้ router.refresh() ของ Next เพื่อดึงข้อมูลจากเซิร์ฟเวอร์ใหม่โดยไม่รีโหลดทั้งหน้า
// (ไม่ใช้ WebSocket เพราะข้อมูลต้นทางมาจากรอบดึงทุก 10 นาทีอยู่แล้ว)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PlatformAutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [lastAt, setLastAt] = useState<string>("");

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
      setLastAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);

  return (
    <span className="text-[11.5px] text-muted-foreground" aria-live="polite">
      อัปเดตอัตโนมัติทุก {seconds} วินาที
      {lastAt ? ` · ล่าสุด ${lastAt}` : ""}
    </span>
  );
}
