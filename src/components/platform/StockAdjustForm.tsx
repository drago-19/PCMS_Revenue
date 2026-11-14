"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * ปรับจำนวนสต็อกแบบ ± (ไม่ใช่ตั้งค่าทับ) — ส่งจำนวนที่เห็นตอนกดไปด้วย
 * เพื่อให้เซิร์ฟเวอร์ตรวจได้ว่ามีคนซื้อไประหว่างนั้นหรือไม่
 */
export function StockAdjustForm({
  shopId,
  productId,
  skuId,
  quantity,
  canWrite,
  blockedReason,
}: {
  shopId: string;
  productId: string;
  skuId: string;
  quantity: number;
  canWrite: boolean;
  blockedReason?: string;
}) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = Number(delta);
    if (!Number.isFinite(value) || value === 0) {
      setError("ใส่จำนวนที่ต้องการเพิ่ม (+) หรือลด (−) เช่น 5 หรือ -3");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/platform/tiktok/stock/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, productId, skuId, delta: Math.trunc(value), expectedQuantity: quantity }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        quantity?: number;
        detail?: { current?: number } | null;
      };
      if (!res.ok) {
        setError(
          data.detail?.current != null
            ? `${data.error ?? "แก้ไม่สำเร็จ"} — กดปิดแล้วเปิดใหม่เพื่อดูค่าล่าสุด`
            : (data.error ?? "แก้ไม่สำเร็จ"),
        );
        router.refresh();
        return;
      }
      setMessage(`อัปเดตแล้ว — คงเหลือรวมตอนนี้ ${data.quantity ?? "?"}`);
      setDelta("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">
        {blockedReason ?? "ยังไม่เปิดให้แก้สต็อกบนร้านนี้ — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน"}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3">
      <label className="text-[12.5px] font-bold" htmlFor="stock-delta">
        เพิ่ม / ลดสต็อก (ไม่ใช่ตั้งค่าทับ)
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          id="stock-delta"
          inputMode="numeric"
          placeholder="เช่น 5 หรือ -3"
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
          className="h-10 w-32 text-[13px]"
          disabled={saving}
        />
        <Button onClick={submit} disabled={saving} aria-busy={saving}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
        <span className="text-[11.5px] text-muted-foreground">
          ระบบจะอ่านค่าสดจาก TikTok ก่อนเขียนทุกครั้ง — ถ้ามีคนซื้อไประหว่างนั้นจะไม่เขียนทับ
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
