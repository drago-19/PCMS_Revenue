"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { scheduleHardRefresh } from "@/lib/sale/refresh";

/**
 * ปุ่ม "ดึงข้อมูลล่าสุด" — ดึงออเดอร์ + สต็อกของร้านที่กำลังดูอยู่ทันที
 * ไม่ต้องรอรอบรีเฟรชอัตโนมัติ 30 วินาที; เสร็จแล้วโหลดหน้าใหม่ให้เห็นค่าล่าสุดเลย
 */
export function RefreshAllButton({ shopId }: { shopId?: string }) {
  const params = useSearchParams();
  const shop = params.get("shop") ?? shopId ?? "";
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/platform/sale-refresh?shop=${encodeURIComponent(shop)}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        orders?: number;
        stockChanged?: number;
        stockSkus?: number;
        stockError?: string | null;
      };
      if (!res.ok) {
        toast.error(data.error ?? "ดึงข้อมูลไม่สำเร็จ");
        return;
      }
      const parts = [`ออเดอร์ ${data.orders ?? 0}`, `สต็อก ${data.stockChanged ?? 0} รายการ`];
      toast.success("ดึงข้อมูลล่าสุดแล้ว", { description: parts.join(" · ") });
      if (data.stockError) toast.warning(`สต็อก: ${data.stockError}`);
      scheduleHardRefresh(600);
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ — ลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={run}
      disabled={busy}
      aria-busy={busy}
      className="gap-1.5"
    >
      <RefreshCw className={busy ? "size-3.5 animate-spin motion-reduce:animate-none" : "size-3.5"} aria-hidden="true" />
      {busy ? "กำลังดึง…" : "ดึงข้อมูลล่าสุด"}
    </Button>
  );
}
