"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scheduleHardRefresh } from "@/lib/sale/refresh";

/**
 * เปลี่ยนรูปหลักของสินค้า
 * - เลือกไฟล์ผ่านกรอบแบบลากวาง (ไม่ใช้ปุ่ม Choose File ดิบ ๆ ของเบราว์เซอร์)
 * - เห็นตัวอย่างก่อนบันทึก และเห็นสถานะ "กำลังอัปโหลด" ระหว่างรอ TikTok
 * - บันทึกสำเร็จแล้วเปลี่ยนรูปที่แสดงทันทีจาก URL ที่เซิร์ฟเวอร์อ่านกลับมา ไม่ต้องรอรีเฟรช
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
  const [savedImage, setSavedImage] = useState<string | null>(currentImageUrl);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSavedImage(currentImageUrl);
  }, [currentImageUrl]);

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
    setMessage(null);
    setError(null);
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
      const data = (await res.json().catch(() => ({}))) as { error?: string; imageUrl?: string | null };
      if (!res.ok) {
        setError(data.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }

      // โชว์รูปใหม่ทันทีจาก URL ที่เซิร์ฟเวอร์อ่านกลับมา (ไม่ต้องรอข้อมูลชุดใหม่)
      if (data.imageUrl) setSavedImage(data.imageUrl);
      if (inputRef.current) inputRef.current.value = "";
      pick(null);
      setMessage(
        data.imageUrl
          ? "เปลี่ยนรูปหลักแล้ว — รูปที่เห็นคือรูปใหม่บน TikTok"
          : "ส่งรูปใหม่ไปที่ TikTok แล้ว — รูปในระบบจะอัปเดตในรอบซิงก์ถัดไป",
      );
      // โหลดหน้าใหม่จากเซิร์ฟเวอร์แบบเต็ม เพื่อให้รูปที่แสดงตรงกับฐานข้อมูลทันที
      scheduleHardRefresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  const shown = preview ?? savedImage;

  return (
    <section aria-label="เปลี่ยนรูปสินค้า" className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-bold">เปลี่ยนรูปหลัก</span>
        <span className="text-[11.5px] text-muted-foreground">JPG / PNG / WebP ไม่เกิน 8MB</span>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {/* รูปที่แสดง: ตัวอย่างที่เลือกไว้ก่อน แล้วจึงเป็นรูปปัจจุบัน/รูปที่เพิ่งบันทึก */}
        <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="รูปสินค้า" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[11px] text-muted-foreground">ไม่มีรูป</span>
          )}
          {saving ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45">
              <Loader2 className="size-5 animate-spin text-white motion-reduce:animate-none" aria-hidden="true" />
              <span className="sr-only">กำลังอัปโหลดรูป</span>
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            id="product-image"
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={saving}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <label
            htmlFor="product-image"
            className={[
              "flex min-h-[64px] cursor-pointer flex-col items-start justify-center gap-0.5 rounded-lg border border-dashed px-3 py-2 transition-colors",
              "border-border bg-muted/30 hover:border-[color:var(--primary)] hover:bg-[color:var(--accent)]",
              saving ? "pointer-events-none opacity-60" : "",
            ].join(" ")}
          >
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
              <Upload className="size-3.5" aria-hidden="true" />
              เลือกรูปจากเครื่อง
            </span>
            <span className="w-full truncate text-[11.5px] text-muted-foreground">
              {fileName ?? "ยังไม่ได้เลือกไฟล์ — รองรับ JPG / PNG / WebP"}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={upload}
              disabled={saving || !fileName}
              aria-busy={saving}
              className="min-h-[40px] gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  กำลังอัปโหลด…
                </>
              ) : (
                "บันทึกเป็นรูปหลัก"
              )}
            </Button>
            <span className="truncate text-[11.5px] text-muted-foreground">
              {preview ? "ตัวอย่างรูปใหม่ (ยังไม่บันทึก)" : savedImage ? "รูปปัจจุบันบน TikTok" : ""}
            </span>
          </div>
        </div>
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
    </section>
  );
}
