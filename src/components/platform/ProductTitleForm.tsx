"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * แก้ชื่อสินค้าบน TikTok จากในระบบเรา
 * ปุ่มบันทึกเป็นสีเขียวตามภาษาสีของหมวดนี้ (เขียว = บันทึก/เพิ่ม)
 */
export function ProductTitleForm({
  shopId,
  productId,
  title,
}: {
  shopId: string;
  productId: string;
  title: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const dirty = trimmed !== title.trim() && trimmed.length >= 3;

  const submit = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/platform/tiktok/product/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, productId, title: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string };
      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setMessage("บันทึกชื่อใหม่แล้ว");
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="แก้ไขชื่อสินค้า" className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <label htmlFor="product-title" className="text-[12.5px] font-bold">
        แก้ไขชื่อสินค้า
      </label>
      <div className="flex flex-col gap-2 min-[520px]:flex-row">
        <Input
          id="product-title"
          value={value}
          maxLength={255}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          className="min-h-[40px]"
        />
        <Button
          type="button"
          onClick={submit}
          disabled={saving || !dirty}
          aria-busy={saving}
          className="min-h-[40px] shrink-0 bg-[color:var(--ok)] text-white hover:bg-[color:var(--ok)]/90"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกชื่อ"}
        </Button>
      </div>
      <p className="text-[11.5px] leading-5 text-muted-foreground">
        ชื่อนี้แสดงบน TikTok ทันทีหลังบันทึก — ต้องยาวอย่างน้อย 3 ตัวอักษร
      </p>
      {error ? (
        <p role="alert" className="text-[12.5px] text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-[12.5px] text-[color:var(--ok)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
