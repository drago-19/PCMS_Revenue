"use client";

// ปุ่ม "ดึงข้อมูลสดตอนนี้" — สั่งให้เซิร์ฟเวอร์เริ่มดึงเบื้องหลัง แล้วรีเฟรชตัวเลขในหน้า
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PlatformKey } from "@/lib/platform/platforms";

export function SyncNowButton({
  variant = "default",
  platform = "tiktok",
}: {
  variant?: "default" | "outline" | "ghost";
  platform?: PlatformKey;
} = {}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const endpoint =
        platform === "shopee" ? "/api/platform/shopee/sync-now" : "/api/platform/tiktok/sync-now";
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json()) as { error?: string; shop?: string };
      if (!response.ok) throw new Error(payload.error || "เริ่มดึงไม่สำเร็จ");

      toast.success(`เริ่มดึงข้อมูลสดของ ${payload.shop ?? "ร้าน"} แล้ว — ตัวเลขจะอัปเดตในอีกสักครู่`);
      // ให้เวลาการดึงเบื้องหลังทำงานก่อน แล้วค่อยดึงตัวเลขใหม่มาแสดง
      setTimeout(() => router.refresh(), 8000);
      setTimeout(() => router.refresh(), 20000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เริ่มดึงไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button onClick={run} disabled={running} aria-busy={running} size="sm" variant={variant}>
      {running ? "กำลังสั่งดึง…" : "ดึงข้อมูลสดตอนนี้"}
    </Button>
  );
}
