"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * เปลี่ยนรูปหลักของสินค้า — เลือกไฟล์แล้วเห็นพรีวิวก่อนกดอัปโหลด
 * ใช้ได้เฉพาะร้านทดสอบ (เซิร์ฟเวอร์เป็นคนตรวจสิทธิ์อีกชั้น)
 */
export function ProductImageForm({
  shopId,
  productId,
  currentImageUrl = null,
}: {
  shopId: string;
  productId: string;
  currentImageUrl?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // คืนหน่วยความจำของ object URL เมื่อเปลี่ยนรูปหรือปิดฟอร์ม
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setFileName(null);
      setPreview(null);
      return;
    }
    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
  };

  const upload = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("shopId", shopId);
      form.append("productId", productId);
      form.append("file", file);
      const res = await fetch("/api/platform/tiktok/product/image", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }
      setMessage("เปลี่ยนรูปหลักแล้ว — ระบบดึงรูปใหม่มาแสดงให้แล้ว");
      if (inputRef.current) inputRef.current.value = "";
      pick(null);
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  const shown = preview ?? currentImageUrl;

  return (
    <section aria-label="เปลี่ยนรูปสินค้า" className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <span className="text-[12.5px] font-bold">เปลี่ยนรูปหลัก</span>
      <div className="flex items-center gap-3">
        <div className="size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="ตัวอย่างรูปสินค้า" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[11px] text-muted-foreground">ไม่มีรูป</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            id="product-image"
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={saving}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            className="min-h-[40px] w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[12.5px] file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-[12px] file:font-bold"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={upload}
              disabled={saving || !fileName}
              aria-busy={saving}
              className="min-h-[40px] shrink-0 bg-[color:var(--ok)] text-white hover:bg-[color:var(--ok)]/90"
            >
              {saving ? "กำลังอัปโหลด…" : "อัปโหลดรูป"}
            </Button>
            <span className="truncate text-[11.5px] text-muted-foreground">
              {preview ? "ตัวอย่างรูปใหม่ (ยังไม่บันทึก)" : currentImageUrl ? "รูปปัจจุบัน" : ""}
            </span>
          </div>
        </div>
      </div>
      <p className="text-[11.5px] leading-5 text-muted-foreground">
        JPG / PNG / WebP ไม่เกิน 8MB — รูปใหม่จะกลายเป็นรูปหลักบน TikTok
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
