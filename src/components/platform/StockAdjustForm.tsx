"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ปรับจำนวนสต็อกแบบ ± (ไม่ใช่ตั้งค่าทับ) — ส่งจำนวนที่เห็นตอนกดไปด้วย
 * เพื่อให้เซิร์ฟเวอร์ตรวจได้ว่ามีคนซื้อไประหว่างนั้นหรือไม่
 *
 * ไม่มีช่องให้พิมพ์ตัวเลขเอง: เลือก "เพิ่ม" หรือ "ลด" แล้วกด − / + หรือปุ่มลัด
 * จะเห็นยอดใหม่ก่อนยืนยันทุกครั้ง กันพิมพ์ผิดและกดผิดเครื่องหมาย
 */
const PRESETS = [1, 5, 10, 50] as const;
const MAX_AMOUNT = 9999;

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
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clamp = (value: number) => Math.min(MAX_AMOUNT, Math.max(1, Math.trunc(value)));
  const removeDisabled = quantity <= 0;
  // ลดได้ไม่เกินของที่มี — กันยอดติดลบก่อนถึงเซิร์ฟเวอร์
  const effective = mode === "remove" ? Math.min(amount, Math.max(quantity, 0)) : amount;
  const nextQuantity = mode === "add" ? quantity + effective : Math.max(quantity - effective, 0);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const delta = mode === "add" ? effective : -effective;
      const res = await fetch("/api/platform/tiktok/stock/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, productId, skuId, delta, expectedQuantity: quantity }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        quantity?: number;
        corrected?: boolean;
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
      setMessage(
        data.corrected
          ? `บันทึกแล้ว แต่มีคนซื้อระหว่างนั้น — คงเหลือจริงตอนนี้ ${data.quantity ?? "?"}`
          : `อัปเดตแล้ว — คงเหลือรวมตอนนี้ ${data.quantity ?? "?"}`,
      );
      setAmount(1);
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-dashed border-border p-3 text-center text-[12.5px] text-muted-foreground">
        {blockedReason ?? "ยังไม่เปิดให้แก้สต็อกบนร้านนี้ — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน"}
      </div>
    );
  }

  return (
    <section
      aria-label="ปรับจำนวนสต็อก"
      className="mx-auto flex w-full max-w-md flex-col items-stretch gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="text-center">
        <h3 className="text-[13.5px] font-bold">ปรับจำนวนสต็อก</h3>
        <p className="text-[11.5px] leading-5 text-muted-foreground">
          ระบบอ่านยอดสดจาก TikTok ก่อนทุกครั้ง — ถ้ามีคนซื้อระหว่างนั้นจะไม่เขียนทับ
        </p>
      </div>

      <div
        role="group"
        aria-label="เลือกว่าจะเพิ่มหรือลด"
        className="mx-auto grid w-full max-w-[240px] grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        <button
          type="button"
          onClick={() => setMode("add")}
          aria-pressed={mode === "add"}
          className={cn(
            "min-h-[40px] rounded-lg text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === "add" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          เพิ่ม
        </button>
        <button
          type="button"
          onClick={() => setMode("remove")}
          aria-pressed={mode === "remove"}
          disabled={removeDisabled}
          className={cn(
            "min-h-[40px] rounded-lg text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
            mode === "remove" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          ลด
        </button>
      </div>

      <div className="mx-auto flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="จำนวนที่จะปรับลงหนึ่ง"
          onClick={() => setAmount((value) => clamp(value - 1))}
          disabled={saving || effective <= 1}
          className="size-11"
        >
          <MinusIcon className="size-5" aria-hidden="true" />
        </Button>
        <span
          aria-live="polite"
          aria-label={`จำนวนที่ต้องการ${mode === "add" ? "เพิ่ม" : "ลด"} ${effective}`}
          className="min-w-[72px] text-center text-[28px] font-bold leading-none tabular-nums"
        >
          {effective}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="จำนวนที่จะปรับขึ้นหนึ่ง"
          onClick={() => setAmount((value) => clamp(value + 1))}
          disabled={saving || (mode === "remove" && effective >= quantity)}
          className="size-11"
        >
          <PlusIcon className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
        <span className="sr-only">จำนวนลัด</span>
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant={effective === preset ? "secondary" : "outline"}
            size="sm"
            onClick={() => setAmount(preset)}
            disabled={saving}
            aria-pressed={effective === preset}
            className="min-h-[40px] min-w-[52px] px-3 tabular-nums"
          >
            {preset}
          </Button>
        ))}
      </div>

      <p className="text-center text-[13px]">
        คงเหลือ <span className="font-bold tabular-nums">{quantity}</span>
        <span aria-hidden="true"> → </span>
        <span className="sr-only">จะเป็น</span>
        <span
          className={cn(
            "font-bold tabular-nums",
            mode === "add" ? "text-[#0d6b3c]" : "text-[#b42318]",
          )}
        >
          {nextQuantity}
        </span>
      </p>

      <Button
        type="button"
        onClick={submit}
        disabled={saving}
        aria-busy={saving}
        className="min-h-[44px] w-full"
      >
        {saving
          ? "กำลังบันทึก…"
          : `ยืนยัน${mode === "add" ? "เพิ่ม" : "ลด"} ${effective} ชิ้น`}
      </Button>

      {error ? (
        <p role="alert" className="text-center text-[12.5px] text-[#b42318]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-center text-[12.5px] text-[#0d6b3c]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
