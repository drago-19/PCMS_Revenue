"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SALE_THEME } from "@/lib/sale/theme";

const COMPANIES = [
  { key: "dragon19", label: "ดราก้อน 19" },
  { key: "seeheng", label: "ชีเฮง" },
] as const;

type CompanyKey = (typeof COMPANIES)[number]["key"];

/**
 * เลือกบริษัทที่ร้านนี้สังกัด — ค่ามีผลกับการซิงก์รอบถัดไป
 * (ข้อมูลของร้านจะถูกเขียนลง schema ของบริษัทที่เลือก)
 */
export function ShopCompanyPicker({
  shopId,
  shopName,
  initialCompany,
}: {
  shopId: string;
  shopName: string;
  initialCompany: CompanyKey;
}) {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyKey>(initialCompany);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: CompanyKey) => {
    if (next === company || saving) return;
    setSaving(true);
    setError(null);
    const previous = company;
    setCompany(next); // เปลี่ยนให้เห็นทันที
    try {
      const res = await fetch("/api/platform/shop-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, company: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCompany(previous);
        setError(data.error ?? "บันทึกบริษัทไม่สำเร็จ");
        return;
      }
      router.refresh();
    } catch {
      setCompany(previous);
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{shopName}</span>
      <span className="text-[11.5px] text-muted-foreground">บริษัท</span>
      {/* ใช้ Select ของ shadcn เพื่อให้รายการที่กดลงมาใช้สีธีมเดียวกับหน้าเว็บ (select ของเบราว์เซอร์จัดสีไม่ได้) */}
      <Select value={company} onValueChange={(next) => void change(next as CompanyKey)} disabled={saving}>
        <SelectTrigger
          aria-label={`บริษัทของร้าน ${shopName}`}
          className="min-h-[36px] w-[132px] text-[12.5px] font-semibold"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent style={SALE_THEME}>
          {COMPANIES.map((item) => (
            <SelectItem key={item.key} value={item.key} className="text-[12.5px]">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving ? <span className="text-[11.5px] text-muted-foreground">กำลังบันทึก…</span> : null}
      {error ? (
        <span role="alert" className="w-full text-[11.5px] text-[color:var(--danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
