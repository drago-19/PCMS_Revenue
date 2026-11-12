"use client";

// ปุ่ม "ดึงข้อมูลสดตอนนี้" — สั่งให้เซิร์ฟเวอร์เริ่มดึงเบื้องหลัง แล้วรีเฟรชตัวเลขในหน้า
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SyncNowButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const response = await fetch("/api/platform/tiktok/sync-now", { method: "POST" });
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
    <Button onClick={run} disabled={running} aria-busy={running} size="sm">
      {running ? "กำลังสั่งดึง…" : "ดึงข้อมูลสดตอนนี้"}
    </Button>
  );
}
