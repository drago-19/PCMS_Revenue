import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/sale/AnimatedNumber";
import { cn } from "@/lib/utils";

/**
 * การ์ดตัวเลขของหมวดฝ่ายขาย — ใช้ตัวเลขแบบไล่จำนวนเมื่อค่าเปลี่ยน
 * แยกจาก PlatformStat ของ /platform เพื่อไม่ให้การเปลี่ยนของฝั่งขายไปโดนหน้าของ Dragon19
 */
export function SaleStat({
  label,
  value,
  hint,
  tone = "default",
  format = "int",
}: {
  label: string;
  value: number;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative";
  format?: "int" | "money";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <p className="text-[12px] font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-[22px] leading-8 font-bold",
          tone === "positive" && "text-[color:var(--ok)]",
          tone === "negative" && "text-[color:var(--danger)]",
        )}
      >
        {format === "money" ? "฿" : ""}
        <AnimatedNumber value={value} format={format} />
      </p>
      {hint ? <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
