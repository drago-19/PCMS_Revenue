"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scheduleHardRefresh } from "@/lib/sale/refresh";
import { Input } from "@/components/ui/input";

/**
 * สำเนาเฉพาะฝั่ง sale ของ ProductTitleForm (src/components/platform/ProductTitleForm.tsx)
 * ไฟล์ต้นใช้ร่วมกับหน้า /platform ของ Dragon19 — กฎเขต UI ห้ามแก้ร่วม จึงคัดลอกมาแยกที่นี่
 * ตรรกะเหมือนต้นฉบับทุกอย่าง (endpoint, event, refresh) ต่างกันเฉพาะผังภายในการ์ด
 */
export function SaleProductTitleForm({
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
      // ให้หัวป๊อปอัพเปลี่ยนชื่อทันที ไม่ต้องรอข้อมูลชุดใหม่จากเซิร์ฟเวอร์
      window.dispatchEvent(
        new CustomEvent("sale:product-title-updated", { detail: { productId, title: trimmed } }),
      );
      setMessage("บันทึกชื่อใหม่แล้ว — ชื่อนี้แสดงบน TikTok แล้ว");
      // โหลดหน้าใหม่จากเซิร์ฟเวอร์แบบเต็ม เพื่อให้ตัวเลข/ชื่อ/รูปที่แสดงตรงกับฐานข้อมูลทันที
      // (router.refresh() บางครั้งไม่ทำให้หน้าต่างป๊อปอัพวาดใหม่)
      scheduleHardRefresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  // ไม่มีกรอบการ์ดของตัวเอง — หน้าเว็บห่วงรวมเป็นการ์ด editor เดียวกับฟอร์มรูป (มีเส้นคั่นกลาง)
  return (
    <div aria-label="แก้ไขชื่อสินค้า" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold">ชื่อสินค้า</h3>
        <span className="text-[11.5px] text-muted-foreground">แสดงบน TikTok ทันทีหลังบันทึก · อย่างน้อย 3 ตัวอักษร</span>
      </div>
      {/* ช่องกรอกกับปุ่มอยู่แถวเดียวกัน — ไม่ทิ้งช่องว่างใต้ช่อง */}
      <div className="flex flex-col gap-2 min-[520px]:flex-row">
        <Input
          id="product-title"
          value={value}
          maxLength={255}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          className="min-h-[40px] min-w-0 flex-1"
        />
        <Button
          type="button"
          onClick={submit}
          disabled={saving || !dirty}
          aria-busy={saving}
          className="min-h-[40px] shrink-0 bg-[color:var(--ok)] text-white hover:bg-[color:var(--ok)]/90"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              กำลังบันทึก…
            </>
          ) : (
            "บันทึกชื่อ"
          )}
        </Button>
      </div>
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
    </div>
  );
}
