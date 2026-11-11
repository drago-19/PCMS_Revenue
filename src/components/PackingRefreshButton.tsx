"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconHistory } from "@/components/icons";

/** ปุ่มบังคับดึงข้อมูลใหม่ — ล้างแคชฝั่งเซิร์ฟเวอร์แล้วโหลดหน้าใหม่ */
export function PackingRefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const response = await fetch("/api/shipnity/refresh", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(payload.error ?? "ดึงข้อมูลใหม่ไม่สำเร็จ");
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        results?: { account: string; fetched: number; error: string | null; storedOpen: number }[];
      };
      const results = payload.results ?? [];
      const failed = results.filter((item) => item.error);
      const summary = results
        .filter((item) => !item.error)
        .map((item) => `${item.account} ${item.fetched} ใบ`)
        .join(" · ");

      router.refresh();
      if (failed.length > 0) {
        toast.error(
          failed.map((item) => `${item.account}: ${item.error}`).join(" · ") || "ดึงข้อมูลใหม่ไม่สำเร็จ",
        );
      } else if (results.length === 0) {
        toast.warning("ยังไม่ได้เชื่อม Shipnity — ไปเชื่อมที่หน้าตั้งค่าบริษัทก่อน");
      } else {
        const short = results.some((item) => item.storedOpen > item.fetched);
        (short ? toast.warning : toast.success)(
          short ? `ดึงได้ไม่ครบ: ${summary} (Shipnity จำกัดการเรียก)` : `ดึงแล้ว: ${summary}`,
        );
      }
    } catch {
      toast.error("ดึงข้อมูลใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 no-print"
      onClick={handleClick}
      disabled={busy}
      aria-label="ดึงข้อมูลออเดอร์ล่าสุดจาก Shipnity"
    >
      <IconHistory size={17} />
      {busy ? "กำลังดึง…" : "ดึงใหม่เลย"}
    </Button>
  );
}
