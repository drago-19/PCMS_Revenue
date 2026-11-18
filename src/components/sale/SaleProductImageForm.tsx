"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * สำเนาเฉพาะฝั่ง sale ของ ProductImageForm (src/components/platform/ProductImageForm.tsx)
 * ไฟล์ต้นใช้ร่วมกับหน้า /platform ของ Dragon19 — กฎเขต UI ห้ามแก้ร่วม จึงคัดลอกมาแยกที่นี่
 * ตรรกะเหมือนต้นฉบับทุกอย่าง (ตรวจขนาด, endpoint, รอรูปใหม่จาก TikTok) ต่างกันเฉพาะผังภายใน:
 * พรีวิวกว้างเต็มการ์ดวางบน ส่วนเลือกไฟล์/ปุ่มวางใต้ — อ่านได้ในคอลัมน์แคบ
 */

/** TikTok ยอมรับรูปหลักขนาด 300×300 ถึง 20000×20000 px */
const MIN_SIDE = 300;
const MAX_SIDE = 20000;

export function SaleProductImageForm({
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
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [savedImage, setSavedImage] = useState<string | null>(currentImageUrl);
  // รูปใหม่ที่เพิ่งได้จาก TikTok แต่ DB อาจยังไม่ตาม — ห้ามให้ข้อมูลเก่าจากเซิร์ฟเวอร์เขียนทับ
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pendingUrl) {
      // ต้องรอจน DB ตรงกับรูปใหม่ก่อน จึงเลิกใช้ค่ารอ
      if (currentImageUrl === pendingUrl) {
        setPendingUrl(null);
        setSavedImage(currentImageUrl);
        setMessage("รูปใหม่ขึ้นในระบบแล้ว");
      }
      return;
    }
    setSavedImage(currentImageUrl);
  }, [currentImageUrl, pendingUrl]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const tooSmall = size ? Math.min(size.width, size.height) < MIN_SIDE : false;
  const tooLarge = size ? Math.max(size.width, size.height) > MAX_SIDE : false;

  const pick = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setMessage(null);
    setError(null);
    setSize(null);

    if (!file) {
      setFileName(null);
      setPreview(null);
      return;
    }

    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setPreview(url);

    const image = new Image();
    image.onload = () => {
      setSize({ width: image.naturalWidth, height: image.naturalHeight });
      if (Math.min(image.naturalWidth, image.naturalHeight) < MIN_SIDE) {
        setError(
          `รูปเล็กเกินไป (${image.naturalWidth} × ${image.naturalHeight} px) — TikTok รับรูปขนาดอย่างน้อย ${MIN_SIDE} × ${MIN_SIDE} px`,
        );
      } else if (Math.max(image.naturalWidth, image.naturalHeight) > MAX_SIDE) {
        setError(`รูปใหญ่เกินไป (${image.naturalWidth} × ${image.naturalHeight} px) — TikTok รับไม่เกิน ${MAX_SIDE} px`);
      }
    };
    image.onerror = () => setError("อ่านไฟล์รูปไม่ได้ — ลองบันทึกเป็น JPG/PNG ใหม่");
    image.src = url;
  };

  /** คอยถามเซิร์ฟเวอร์จนรูปใหม่ถูกบันทึกลง DB แล้วค่อยสลับให้เห็น */
  const waitForNewImage = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const res = await fetch("/api/platform/tiktok/product/image/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, productId }),
        });
        const data = (await res.json().catch(() => ({}))) as { imageUrl?: string | null };
        if (data.imageUrl) {
          setPendingUrl(data.imageUrl);
          setSavedImage(data.imageUrl);
          if (inputRef.current) inputRef.current.value = "";
          if (preview) URL.revokeObjectURL(preview);
          setPreview(null);
          setFileName(null);
          setSize(null);
          setMessage("บันทึกไปที่ TikTok แล้ว — กำลังอัปเดตรูปในระบบ…");
          router.refresh();
          return;
        }
      } catch {
        // รอบหน้าลองใหม่
      }
    }
    setMessage("ส่งรูปไป TikTok แล้ว — รูปในระบบจะอัปเดตในรอบซิงก์ถัดไป");
  };

  const upload = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file || saving || tooSmall || tooLarge) return;
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

      if (data.imageUrl) {
        // ได้ URL รูปใหม่จาก TikTok แล้ว แต่ DB อาจตามไม่ทัน — ตั้งเป็นค่ารอไว้ ไม่ให้ props เก่าทับ
        setPendingUrl(data.imageUrl);
        setSavedImage(data.imageUrl);
        if (inputRef.current) inputRef.current.value = "";
        if (preview) URL.revokeObjectURL(preview);
        setPreview(null);
        setFileName(null);
        setSize(null);
        setMessage("บันทึกไปที่ TikTok แล้ว — กำลังอัปเดตรูปในระบบ…");
        router.refresh();
        void waitForNewImage();
      } else {
        // TikTok ยังไม่สะท้อนรูปใหม่: ให้เห็นรูปที่เพิ่งเลือกไว้ก่อน แล้วคอยถามจนได้
        setMessage("บันทึกไปที่ TikTok แล้ว — กำลังรอรูปใหม่ขึ้นในระบบ…");
        void waitForNewImage();
      }
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  const shown = preview ?? savedImage;

  // ไม่มีกรอบการ์ดของตัวเอง — หน้าเว็บห่วงรวมเป็นการ์ด editor เดียวกับฟอร์มชื่อ (มีเส้นคั่นกลาง)
  return (
    <div aria-label="เปลี่ยนรูปสินค้า" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold">รูปหลัก</h3>
        <span className="text-[11.5px] text-muted-foreground">
          JPG / PNG / WebP · อย่างน้อย {MIN_SIDE} × {MIN_SIDE} px · ไม่เกิน 8MB
        </span>
      </div>

      {/* พรีวิวซ้าย (ใหญ่เท่าความสูงคอลัมน์ขวา) · ช่องเลือกไฟล์+ปุ่มขวา — จอแคบกว่า 480px จึงวางซ้อนกัน */}
      <div className="grid gap-3 min-[480px]:grid-cols-[160px_minmax(0,1fr)]">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="รูปสินค้า" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[11.5px] text-muted-foreground">
              ยังไม่มีรูป
            </span>
          )}
          {saving ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="size-6 animate-spin text-white motion-reduce:animate-none" aria-hidden="true" />
              <span className="sr-only">กำลังอัปโหลดรูป</span>
            </span>
          ) : null}
        </div>

        {/* ช่องเลือกไฟล์เป็นกล่องกำลังพอดีเนื้อหา ไม่ยืดยาวว่างๆ */}
        <div className="flex min-w-0 flex-col items-start gap-2">
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
              "inline-flex max-w-full cursor-pointer flex-col items-start justify-center gap-0.5 rounded-lg border border-dashed px-3 py-2 transition-colors",
              "border-border bg-muted/30 hover:border-[color:var(--primary)] hover:bg-[color:var(--accent)]",
              saving ? "pointer-events-none opacity-60" : "",
            ].join(" ")}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-bold">
              <Upload className="size-4" aria-hidden="true" />
              เลือกรูปจากเครื่อง
            </span>
            <span className="w-full truncate text-[11.5px] text-muted-foreground">
              {fileName ?? "ลากไฟล์มาวางหรือคลิกเลือก — JPG / PNG / WebP"}
            </span>
            {size ? (
              <span className="text-[11.5px] text-muted-foreground tabular-nums">
                ขนาด {size.width} × {size.height} px
                {tooSmall ? ` · เล็กกว่า ${MIN_SIDE} px` : ""}
              </span>
            ) : null}
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={upload}
              disabled={saving || !fileName || tooSmall || tooLarge}
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
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
              {preview ? "ตัวอย่างรูปใหม่ (ยังไม่บันทึก)" : savedImage ? "รูปปัจจุบันบน TikTok" : ""}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[12.5px] leading-5 text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-[12.5px] leading-5 text-[color:var(--ok)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
