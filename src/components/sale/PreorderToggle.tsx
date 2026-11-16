"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * ธง "พรีออเดอร์" ราย SKU — TikTok ไม่มีฟิลด์นี้ใน API
 * ใช้ทำป้ายบนออเดอร์ที่ผูกกับ SKU นี้ และตัวกรองในหน้าออเดอร์
 */
export function PreorderToggle({
  shopId,
  skuId,
  value,
}: {
  shopId: string;
  skuId: string;
  value: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const next = !on;
    try {
      const res = await fetch("/api/platform/tiktok/stock/preorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, skuId, value: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setOn(next);
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={on ? "default" : "outline"}
        onClick={toggle}
        disabled={saving}
        aria-pressed={on}
        className="min-h-[36px]"
      >
        {saving ? "กำลังบันทึก…" : on ? "พรีออเดอร์: เปิด" : "ตั้งเป็นพรีออเดอร์"}
      </Button>
      {error ? <span className="text-[11.5px] text-[color:var(--danger)]">{error}</span> : null}
    </div>
  );
}
