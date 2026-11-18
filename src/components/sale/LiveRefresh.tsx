"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * อัปเดตหน้าให้เองโดยไม่ต้องกดรีเฟรช
 *
 * ความสดมีสองชั้น: ข้อมูลจริงขยับตอนตัวซิงก์ดึงออเดอร์/สต็อก (ทุก ~15–30 วินาทีสำหรับช่องทางที่ต่อตรง)
 * ส่วนหน้านี้ดึงข้อมูลใหม่ทุก 5 วินาที (ข้อมูลขยับทุก 10–15 วิ) — ความหน่วงที่เห็นบนจอรวมกันไม่เกิน ~15–20 วิ
 * หยุดดึงเมื่อแท็บไม่ได้อยู่หน้าจอ และดึงทันทีเมื่อกลับมา — ไม่กินคำขอตอนไม่มีใครดู
 */
export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdatedAt(new Date().toLocaleTimeString("th-TH", { hour12: false }));
    };

    timer = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground" role="status" aria-live="polite">
      <span className="size-1.5 rounded-full bg-[color:var(--ok)]" aria-hidden="true" />
      อัปเดตอัตโนมัติทุก {Math.round(intervalMs / 1000)} วินาที
      {updatedAt ? ` · ล่าสุด ${updatedAt}` : ""}
    </span>
  );
}
