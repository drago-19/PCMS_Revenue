"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSpinner } from "@/components/icons";

/**
 * ดึงข้อมูลใหม่จากเซิร์ฟเวอร์เป็นระยะ (หน้า /orders เป็น server component)
 * หยุดชั่วคราวเมื่อแท็บไม่ได้ถูกมองอยู่ และแสดงสถานะเล็ก ๆ ระหว่างกำลังอัปเดต
 */
export function PackingAutoRefresh({ intervalMs = 120_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => router.refresh());
      }
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);

  if (!isPending) return null;

  return (
    <div
      role="status"
      className="fixed top-16 right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.12)] no-print"
    >
      <IconSpinner size={14} />
      กำลังอัปเดตข้อมูล…
    </div>
  );
}
