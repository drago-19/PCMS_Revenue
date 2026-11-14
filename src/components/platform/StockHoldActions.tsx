"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * กัน / คืน สต็อกตามของที่กำลังตีกลับ
 * กัน = ลดจำนวนบน TikTok ตามจำนวนที่ลูกค้าส่งคืนแล้วแต่ของยังไม่ถึงร้าน
 * คืน = ใส่กลับเมื่อรับของจริงแล้ว
 */
export function StockHoldActions({
  shopId,
  productId,
  skuId,
  quantity,
  inTransit,
  held,
  canWrite,
  blockedReason,
}: {
  shopId: string;
  productId: string;
  skuId: string;
  quantity: number;
  inTransit: number;
  held: number;
  canWrite: boolean;
  blockedReason?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<"hold" | "release" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "hold" | "release") => {
    setSaving(action);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/platform/tiktok/stock/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shopId, productId, skuId, expectedQuantity: quantity }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        quantity?: number;
        held?: number;
        released?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "ทำรายการไม่สำเร็จ");
        router.refresh();
        return;
      }
      setMessage(
        action === "hold"
          ? `กันไว้ ${data.held ?? 0} ชิ้น — คงเหลือบน TikTok ตอนนี้ ${data.quantity ?? "?"}`
          : `คืนกลับแล้ว ${data.released ?? 0} ชิ้น — คงเหลือบน TikTok ตอนนี้ ${data.quantity ?? "?"}`,
      );
      router.refresh();
    } finally {
      setSaving(null);
    }
  };

  if (!canWrite) {
    return (
      <div className="rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">
        {blockedReason ?? "ร้านนี้ยังไม่เปิดให้แก้สต็อก"}
      </div>
    );
  }

  if (held <= 0 && inTransit <= 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3">
      <p className="text-[12.5px] font-bold">ของที่กำลังตีกลับ</p>
      <p className="text-[12px] leading-5 text-muted-foreground">
        {inTransit > 0
          ? `ลูกค้าส่งคืนแล้ว ${inTransit} ชิ้น แต่ของยังไม่ถึงร้าน — ยังไม่ควรขายซ้ำ`
          : "ไม่มีของที่กำลังเดินกลับในตอนนี้"}
        {held > 0 ? ` · กันไว้แล้ว ${held} ชิ้น` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {held > 0 ? (
          <Button onClick={() => run("release")} disabled={saving !== null} aria-busy={saving === "release"}>
            {saving === "release" ? "กำลังคืน…" : `คืนสต็อก ${held} ชิ้น (รับของแล้ว)`}
          </Button>
        ) : (
          <Button onClick={() => run("hold")} disabled={saving !== null} aria-busy={saving === "hold"}>
            {saving === "hold" ? "กำลังกัน…" : `กันสต็อก ${inTransit} ชิ้น`}
          </Button>
        )}
        <span className="text-[11.5px] text-muted-foreground">
          ระบบอ่านค่าสดจาก TikTok ก่อนเขียนทุกครั้ง — ถ้ามีคนซื้อระหว่างนั้นจะไม่เขียนทับ
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-[12.5px] text-[#b42318]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-[12.5px] text-[#0d6b3c]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
