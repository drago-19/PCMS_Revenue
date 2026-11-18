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
        // ยอดขยับไประหว่างนั้น (ตอนไลฟ์เกิดตลอด): รับยอดล่าสุดมาเป็นฐานใหม่
        // แล้วคงจำนวนที่กรอกไว้ เพื่อให้กดยืนยันซ้ำได้ในคลิกเดียว
        const fresh = data.detail?.current;
        if (typeof fresh === "number") {
          setBase(fresh);
          setError(
            `${data.error ?? "แก้ไม่สำเร็จ"} — ยอดล่าสุดคือ ${fresh} กดยืนยันอีกครั้งเพื่อ${
              mode === "add" ? "เพิ่ม" : "ลด"
            } ${effective} บนยอดใหม่`,
          );
        } else {
          setError(data.error ?? "แก้ไม่สำเร็จ");
        }
        // ย้อนเลขที่เดาไว้กลับเป็นยอดจริงที่เพิ่งได้มา
        window.dispatchEvent(
          new CustomEvent("sale:stock-updated", {
            detail: { skuId, quantity: typeof fresh === "number" ? fresh : base },
          }),
        );
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
      <div className="rounded-xl border border-dashed border-border bg-card p-3 text-[12.5px] text-muted-foreground">
        {blockedReason ?? "ยังไม่เปิดให้แก้สต็อกบนร้านนี้ — ต้องทดสอบบนร้านทดสอบให้ผ่านก่อน"}
      </div>
    );
  }

  // การ์ดภาษาเดียวกับการ์ดอื่นในป๊อปอัพ: หัวเรื่องซ้าย คำอธิบายขวา ปุ่มเต็มความกว้าง
  return (
    <section
      aria-label="ปรับจำนวนสต็อก"
      className="flex w-full flex-col items-stretch gap-3 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold">ปรับจำนวนสต็อก</h3>
        <span className="text-[11.5px] text-muted-foreground">
          อ่านยอดสดจาก TikTok ก่อนทุกครั้ง — มีคนซื้อระหว่างนั้นจะไม่เขียนทับ
        </span>
      </div>

      <div
        role="group"
        aria-label="เลือกว่าจะเพิ่มหรือลด"
        className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1"
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

      {/* แถวปรับจำนวน: − ตัวเลขใหญ่ + เต็มความกว้าง ปุ่มใหญ่แตะง่าย */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="จำนวนที่จะปรับลงหนึ่ง"
          onClick={() => setAmount((value) => clamp(value - 1))}
          disabled={saving || amount <= 0}
          className="size-12"
        >
          <MinusIcon className="size-5" aria-hidden="true" />
        </Button>
        <span
          aria-live="polite"
          aria-label={`จำนวนที่ต้องการ${mode === "add" ? "เพิ่ม" : "ลด"} ${effective}`}
          className="min-w-[72px] text-center text-[32px] font-bold leading-none tabular-nums"
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
          className="size-12"
        >
          <PlusIcon className="size-5" aria-hidden="true" />
        </Button>
      </div>

      {/* ปุ่มลัดเรียง 4 ช่องเท่ากันเต็มความกว้าง · ล้างอยู่แถวพรีวิว */}
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant={effective === preset ? "secondary" : "outline"}
            size="sm"
            onClick={() => setAmount((value) => clamp(value + preset))}
            disabled={saving}
            aria-label={`บวกเพิ่ม ${preset}`}
            className="min-h-[40px] tabular-nums"
          >
            +{preset}
          </Button>
        ))}
      </div>

      {/* แถบพรีวิวยอด: ก่อน → หลัง เด่นเป็นพื้นหลังเทา กันกดผิดโดยไม่เห็นผล */}
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
        <span className="text-muted-foreground">
          คงเหลือ <span className="font-bold tabular-nums text-foreground">{base}</span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">→</span>
        <span className="text-muted-foreground">
          จะเป็น{" "}
          <span
            className={cn(
              "font-bold tabular-nums",
              mode === "add" ? "text-[#0d6b3c]" : "text-[#b42318]",
            )}
          >
            {nextQuantity}
          </span>
        </span>
        {amount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAmount(0)}
            disabled={saving}
            className="min-h-[32px] px-2 text-[12px] text-muted-foreground"
          >
            ล้าง
          </Button>
        ) : null}
      </div>

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
