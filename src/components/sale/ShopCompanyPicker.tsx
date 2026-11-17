"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      <label htmlFor={`company-${shopId}`} className="text-[11.5px] text-muted-foreground">
        บริษัท
      </label>
      <select
        id={`company-${shopId}`}
        value={company}
        disabled={saving}
        onChange={(event) => void change(event.target.value as CompanyKey)}
        className="min-h-[36px] rounded-md border border-border bg-background px-2 text-[12.5px] font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {COMPANIES.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
      {saving ? <span className="text-[11.5px] text-muted-foreground">กำลังบันทึก…</span> : null}
      {error ? (
        <span role="alert" className="w-full text-[11.5px] text-[color:var(--danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
