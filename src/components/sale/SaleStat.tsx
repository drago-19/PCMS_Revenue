"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CompactValueToggle } from "@/components/CompactValueToggle";
import { cn } from "@/lib/utils";

/**
 * การ์ดตัวเลขของหมวดฝ่ายขาย
 * ยอดรวมแสดงค่านิ่ง ๆ ตามที่อ่านได้จากฐานข้อมูล — เวลามีของใหม่จะโชว์ "ป้ายส่วนต่าง" (+3 / −2)
 * แล้วหายเองใน 6 วินาที แทนการไล่นับยอดทั้งหมดใหม่ (อ่านง่ายกว่า และไม่หลอกตาว่าเลขวิ่งตลอด)
 */
export function SaleStat({
  label,
  value,
  scopeKey,
  hint,
  tone = "default",
  format = "int",
}: {
  label: string;
  value: number;
  /** ตัวกรอง/ร้าน/ช่วงเวลาที่กำลังดู — เปลี่ยนชุดนี้คือคนละข้อมูล ห้ามขึ้นส่วนต่าง */
  scopeKey: string;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative";
  format?: "int" | "money";
}) {
  const [delta, setDelta] = useState<number | null>(null);
  const previous = useRef(value);
  const lastScope = useRef(scopeKey);
  // ค่าแรก ๆ หลังเปิดหน้าอาจเป็นค่าที่ไคลเอนต์ถือมาจากหน้าจอก่อน — ไม่นับเป็น "ของใหม่"
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (lastScope.current !== scopeKey) {
      lastScope.current = scopeKey;
      previous.current = value;
      setDelta(null);
      return;
    }
    const before = previous.current;
    if (value === before) return;
    previous.current = value;
    if (Date.now() - mountedAt.current < 1500) return;
    setDelta(value - before);
    const timer = setTimeout(() => setDelta(null), 6000);
    return () => clearTimeout(timer);
  }, [value, scopeKey]);

  const digits = format === "money" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined;
  const total = value.toLocaleString("th-TH", digits);
  const deltaText =
    delta === null ? null : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("th-TH", digits)}`;

  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-muted-foreground">{label}</p>
        {deltaText ? (
          <span
            key={deltaText}
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
              "animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none",
              delta !== null && delta > 0
                ? "bg-[color:var(--ok-soft)] text-[color:var(--ok)]"
                : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
            )}
            aria-label={`เปลี่ยนแปลง ${deltaText}`}
          >
            {deltaText}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 text-[22px] leading-8 font-bold tabular-nums",
          tone === "positive" && "text-[color:var(--ok)]",
          tone === "negative" && "text-[color:var(--danger)]",
        )}
      >
        {/* ตัวเลขยาว ๆ ย่อแบบหน้า /bills — กดที่ตัวเลขเพื่อสลับย่อ/เต็ม */}
        <CompactValueToggle value={`${format === "money" ? "฿" : ""}${total}`} />
      </p>
      {hint ? <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
