"use client";

import { useEffect, useState } from "react";
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

export function SaleStockAdjustForm({
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
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ยอดฐานที่ใช้คำนวณ — อัปเดตจากผลตอบของเซิร์ฟเวอร์ทันทีหลังบันทึก
  // เพราะหน้าจออาจยังถือค่าเดิมอยู่ (RSC ไม่ได้ส่งค่าใหม่มาในรอบนั้น)
  const [base, setBase] = useState(quantity);

  useEffect(() => {
    setBase(quantity);
  }, [quantity]);

  // เพดานของโหมด "ลด" คือยอดคงเหลือ — กดเพิ่มเกินแล้วตัวเลขต้องหยุด ไม่ใช่ค้างที่ค่าเดิม
  const maxAmount = mode === "remove" ? Math.max(base, 0) : MAX_AMOUNT;
  const clamp = (value: number) => Math.min(maxAmount, Math.max(0, Math.trunc(value)));
  // สลับโหมด = เริ่มนับใหม่ที่ 0 (ไม่ใช้ค่าที่ค้างจากอีกโหมด)
  const changeMode = (next: "add" | "remove") => {
    setMode(next);
    setAmount(0);
  };
  const removeDisabled = base <= 0;
  const effective = Math.min(amount, maxAmount);
  const nextQuantity = mode === "add" ? base + effective : Math.max(base - effective, 0);
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const delta = mode === "add" ? effective : -effective;
      // ขึ้นเลขบนหน้าจอทันทีแบบไม่ต้องรอ API — ถ้าล้มเหลวจะย้อนกลับด้านล่าง
      window.dispatchEvent(
        new CustomEvent("sale:stock-updated", { detail: { skuId, quantity: Math.max(0, base + delta) } }),
      );
      const res = await fetch("/api/platform/tiktok/stock/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, productId, skuId, delta, expectedQuantity: base }),
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
        // ย้อนเลขที่เดาไว้กลับเป็นค่าเดิม เพราะการบันทึกไม่สำเร็จ
        window.dispatchEvent(
          new CustomEvent("sale:stock-updated", { detail: { skuId, quantity: base } }),
        );
        router.refresh();
        return;
      }
      setMessage(
        data.corrected
          ? `บันทึกแล้ว แต่มีคนซื้อระหว่างนั้น — คงเหลือจริงตอนนี้ ${data.quantity ?? "?"}`
          : `อัปเดตแล้ว — คงเหลือรวมตอนนี้ ${data.quantity ?? "?"}`,
      );
      setAmount(0);
      if (typeof data.quantity === "number") setBase(data.quantity);
      // ให้ตัวเลขในป๊อปอัพขยับทันที ไม่ต้องรอข้อมูลชุดใหม่จากเซิร์ฟเวอร์
      if (typeof data.quantity === "number") {
        window.dispatchEvent(
          new CustomEvent("sale:stock-updated", { detail: { skuId, quantity: data.quantity } }),
        );
      }
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
          onClick={() => changeMode("add")}
          aria-pressed={mode === "add"}
          className={cn(
            "min-h-[40px] rounded-lg border text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === "add"
              ? "border-[color:var(--ok)] bg-[color:var(--ok-soft)] text-[color:var(--ok)]"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          เพิ่ม
        </button>
        <button
          type="button"
          onClick={() => changeMode("remove")}
          aria-pressed={mode === "remove"}
          disabled={removeDisabled}
          className={cn(
            "min-h-[40px] rounded-lg border text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
            mode === "remove"
              ? "border-[color:var(--danger)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
              : "border-transparent text-muted-foreground hover:text-foreground",
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
          disabled={saving || amount <= 0}
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
          disabled={saving || (mode === "remove" && effective >= base)}
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
            onClick={() => setAmount((value) => clamp(value + preset))}
            disabled={saving}
            aria-label={`บวกเพิ่ม ${preset}`}
            className="min-h-[40px] min-w-[56px] px-3 tabular-nums"
          >
            +{preset}
          </Button>
        ))}
        {amount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAmount(0)}
            disabled={saving}
            className="min-h-[40px] px-3 text-[12px] text-muted-foreground"
          >
            ล้าง
          </Button>
        ) : null}
      </div>

      <p className="text-center text-[13px]">
        คงเหลือ <span className="font-bold tabular-nums">{base}</span>
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
        disabled={saving || effective < 1}
        aria-busy={saving}
        className={cn(
          "min-h-[44px] w-full text-white",
          mode === "add"
            ? "bg-[color:var(--ok)] hover:bg-[color:var(--ok)]/90"
            : "bg-[color:var(--danger)] hover:bg-[color:var(--danger)]/90",
        )}
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
