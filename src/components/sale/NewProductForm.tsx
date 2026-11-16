"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * ฟอร์มสร้างสินค้าใหม่ (ร้านทดสอบเท่านั้น)
 * ลำดับ: อัปโหลดรูป → สร้างสินค้า (หมวด/คลังใช้ของสินค้าที่มีอยู่แล้วในร้าน)
 */
export function NewProductForm({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sellerSku, setSellerSku] = useState("");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [weightGrams, setWeightGrams] = useState("200");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  const submit = async () => {
    if (saving) return;
    setError(null);
    if (!file) return setError("ต้องเลือกไฟล์รูปสินค้า");
    if (title.trim().length < 25) return setError("ชื่อสินค้าต้องยาว 25–255 ตัวอักษร");
    setSaving(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("shopId", shopId);
      uploadForm.append("file", file);
      const uploadRes = await fetch("/api/platform/tiktok/product/upload", { method: "POST", body: uploadForm });
      const uploadData = (await uploadRes.json().catch(() => ({}))) as { uri?: string; error?: string };
      if (!uploadRes.ok || !uploadData.uri) {
        setError(uploadData.error ?? "อัปโหลดรูปไม่สำเร็จ");
        return;
      }

      const res = await fetch("/api/platform/tiktok/product/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          title: title.trim(),
          description: description.trim() || title.trim(),
          imageUri: uploadData.uri,
          sellerSku: sellerSku.trim(),
          price: Number(price),
          quantity: Number(quantity),
          weightGrams: Number(weightGrams),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { productId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "สร้างสินค้าไม่สำเร็จ");
        return;
      }
      setCreatedId(data.productId ?? null);
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="เพิ่มสินค้า" className="grid gap-3 rounded-xl border border-border bg-card p-4 min-[720px]:grid-cols-[200px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-bold">รูปหลัก</span>
          <div className="aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="ตัวอย่างรูปสินค้า" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-[11.5px] text-muted-foreground">ยังไม่ได้เลือกรูป</span>
            )}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={saving}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            className="min-h-[40px] w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[12px] file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-[11.5px] file:font-bold"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-bold">ชื่อสินค้า (25–255 ตัวอักษร)</span>
            <Input value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} disabled={saving} className="min-h-[40px]" />
            <span className="text-[11.5px] text-muted-foreground">{title.trim().length}/255</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-bold">คำอธิบาย</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[12.5px]"
            />
          </label>

          <div className="grid gap-2 min-[520px]:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">รหัส SKU</span>
              <Input value={sellerSku} maxLength={80} onChange={(event) => setSellerSku(event.target.value)} disabled={saving} className="min-h-[40px]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">ราคา (บาท)</span>
              <Input value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} disabled={saving} className="min-h-[40px]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">สต็อกเริ่มต้น</span>
              <Input value={quantity} inputMode="numeric" onChange={(event) => setQuantity(event.target.value)} disabled={saving} className="min-h-[40px]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">น้ำหนัก (กรัม)</span>
              <Input value={weightGrams} inputMode="numeric" onChange={(event) => setWeightGrams(event.target.value)} disabled={saving} className="min-h-[40px]" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={saving}
              aria-busy={saving}
              className="min-h-[40px] bg-[color:var(--ok)] text-white hover:bg-[color:var(--ok)]/90"
            >
              {saving ? "กำลังสร้าง…" : "สร้างสินค้า"}
            </Button>
            <span className="text-[11.5px] text-muted-foreground">
              สร้างเป็นแบบร่างบน TikTok — หมวดและคลังใช้ของสินค้าที่มีอยู่แล้วในร้าน
            </span>
          </div>

          {error ? (
            <p role="alert" className="text-[12.5px] text-[color:var(--danger)]">{error}</p>
          ) : null}
          {createdId ? (
            <p role="status" className="text-[12.5px] text-[color:var(--ok)]">
              สร้างสินค้าแล้ว (รหัส {createdId}) — รอระบบดึงข้อมูลสักครู่แล้วดูได้ที่หน้าสต็อก
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
