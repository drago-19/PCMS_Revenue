"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assertCreateProductSkus, MAX_PRODUCT_SKUS } from "@/lib/platform/product-payload";

type SizeRow = {
  key: number;
  sellerSku: string;
  sizeName: string;
  price: string;
  quantity: string;
};

/**
 * ฟอร์มสร้างสินค้าใหม่ (ร้านทดสอบเท่านั้น)
 * ลำดับ: อัปโหลดรูป → สร้างสินค้า (หมวด/คลังใช้ของสินค้าที่มีอยู่แล้วในร้าน)
 * กรอกตาราง "สินค้าย่อย/ไซส์" ไว้ = สร้างหลายไซส์ในครั้งเดียว, ไม่กรอก = รหัสเดียวเหมือนเดิม
 *
 * linkCentral: ใช้จากหน้าสต็อกกลาง — ให้เซิร์ฟเวอร์ตั้งยอดกลาง/ผูกประกาศให้หลังสร้างเสร็จ
 * onCreated: เรียกหลังสร้างสำเร็จ (ไดอะล็อกใช้ปิดตัวเองแล้วรีเฟรชหน้า)
 */
export function NewProductForm({
  shopId,
  linkCentral = false,
  onCreated,
}: {
  shopId: string;
  linkCentral?: boolean;
  onCreated?: (productId: string) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sellerSku, setSellerSku] = useState("");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [weightGrams, setWeightGrams] = useState("200");
  const [rows, setRows] = useState<SizeRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  const hasRows = rows.length > 0;

  const addRow = () => {
    if (rows.length >= MAX_PRODUCT_SKUS) {
      setError(`เพิ่มได้ไม่เกิน ${MAX_PRODUCT_SKUS} รหัสย่อยต่อสินค้า`);
      return;
    }
    const nextKey = rows.reduce((max, row) => Math.max(max, row.key), 0) + 1;
    setRows((current) => [
      ...current,
      { key: nextKey, sellerSku: "", sizeName: "", price, quantity },
    ]);
  };

  const updateRow = (key: number, patch: Partial<Omit<SizeRow, "key">>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const submit = async () => {
    if (saving) return;
    setError(null);
    setWarnings([]);
    setCreatedId(null);
    if (!file) return setError("ต้องเลือกไฟล์รูปสินค้า");
    const name = title.trim();
    if (name.length < 25 || name.length > 255) return setError("ชื่อสินค้าต้องยาว 25–255 ตัวอักษร");

    // ไม่กรอกไซส์เลย = สร้างรหัสเดียวจากช่องด้านบน / กรอกแล้ว = ใช้รหัสในตารางเท่านั้น
    const skus = hasRows
      ? rows.map((row) => ({
          sellerSku: row.sellerSku.trim(),
          sizeName: row.sizeName.trim() || null,
          price: Number(row.price),
          quantity: Number(row.quantity),
        }))
      : [{ sellerSku: sellerSku.trim(), sizeName: null, price: Number(price), quantity: Number(quantity) }];

    try {
      assertCreateProductSkus(skus);
    } catch (validationError) {
      return setError(validationError instanceof Error ? validationError.message : String(validationError));
    }

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
          title: name,
          description: description.trim() || name,
          imageUri: uploadData.uri,
          skus,
          weightGrams: Number(weightGrams),
          linkCentral,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        productId?: string;
        error?: string;
        warnings?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? "สร้างสินค้าไม่สำเร็จ");
        return;
      }
      const nextWarnings = data.warnings ?? [];
      setWarnings(nextWarnings);
      setCreatedId(data.productId ?? null);
      router.refresh();
      // มีคำเตือน (เช่น ตั้งยอดกลางไม่สำเร็จ) ให้ค้างฟอร์มไว้เพื่ออ่านข้อความจริง ไม่ปิดหายไป
      if (data.productId && nextWarnings.length === 0) onCreated?.(data.productId);
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
            aria-label="ไฟล์รูปสินค้า"
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
              <Input value={sellerSku} maxLength={80} onChange={(event) => setSellerSku(event.target.value)} disabled={saving || hasRows} className="min-h-[40px]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">ราคา (บาท)</span>
              <Input value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} disabled={saving || hasRows} className="min-h-[40px]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">สต็อกเริ่มต้น</span>
              <Input value={quantity} inputMode="numeric" onChange={(event) => setQuantity(event.target.value)} disabled={saving || hasRows} className="min-h-[40px]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold">น้ำหนัก (กรัม)</span>
              <Input value={weightGrams} inputMode="numeric" onChange={(event) => setWeightGrams(event.target.value)} disabled={saving} className="min-h-[40px]" />
            </label>
          </div>
          {hasRows ? (
            <p className="text-[11.5px] text-muted-foreground">
              ใช้รหัสย่อยในตารางด้านล่างแทนรหัส SKU/ราคา/สต็อกด้านบน — ช่องเหล่านี้ปิดไว้เพื่อไม่ให้สับสน
            </p>
          ) : null}
        </div>
      </section>

      <section aria-label="สินค้าย่อยหรือไซส์" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold">สินค้าย่อย / ไซส์</h2>
            <p className="text-[11.5px] leading-5 text-muted-foreground">
              ไม่ต้องกรอกก็ได้ — ถ้าไม่กรอก ระบบจะสร้างสินค้ารหัสเดียวจากช่องด้านบน
            </p>
          </div>
          <Button type="button" variant="outline" onClick={addRow} disabled={saving} className="min-h-[40px]">
            เพิ่มไซส์
          </Button>
        </div>

        {hasRows ? (
          <ul className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <li
                key={row.key}
                className="grid gap-2 rounded-lg border border-border p-2 min-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_100px_auto] min-[720px]:items-end"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-bold">รหัสย่อย {index + 1} (บังคับ)</span>
                  <Input
                    value={row.sellerSku}
                    maxLength={80}
                    onChange={(event) => updateRow(row.key, { sellerSku: event.target.value })}
                    disabled={saving}
                    placeholder="K-5ORS-16-F"
                    className="min-h-[40px]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-bold">ชื่อไซส์</span>
                  <Input
                    value={row.sizeName}
                    maxLength={60}
                    onChange={(event) => updateRow(row.key, { sizeName: event.target.value })}
                    disabled={saving}
                    placeholder="Free size / Plus size / M"
                    className="min-h-[40px]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-bold">ราคา (บาท)</span>
                  <Input
                    value={row.price}
                    inputMode="decimal"
                    onChange={(event) => updateRow(row.key, { price: event.target.value })}
                    disabled={saving}
                    className="min-h-[40px]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-bold">สต็อก</span>
                  <Input
                    value={row.quantity}
                    inputMode="numeric"
                    onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                    disabled={saving}
                    className="min-h-[40px]"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => removeRow(row.key)}
                  disabled={saving}
                  aria-label={`ลบไซส์ที่ ${index + 1}`}
                  className="min-h-[40px] text-[color:var(--danger)]"
                >
                  ลบ
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-[12px] text-muted-foreground">
            ยังไม่มีไซส์ — ระบบจะสร้างสินค้า 1 รหัสจากช่องรหัส SKU ด้านบน
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={saving}
          aria-busy={saving}
          className="min-h-[40px] bg-[color:var(--ok)] text-white hover:bg-[color:var(--ok)]/90"
        >
          {saving ? "กำลังสร้าง…" : hasRows ? `สร้างสินค้า (${rows.length} ไซส์)` : "สร้างสินค้า"}
        </Button>
        <span className="text-[11.5px] text-muted-foreground">
          สร้างบน TikTok แล้วเปิดขายทันที (สถานะเปิดตะกร้า) — หมวดและคลังใช้ของสินค้าที่มีอยู่แล้วในร้าน
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-[12.5px] text-[color:var(--danger)]">{error}</p>
      ) : null}
      {warnings.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 rounded-lg border border-[color:var(--danger)]/40 p-2 text-[12px] text-[color:var(--danger)]">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {createdId ? (
        <p role="status" className="flex flex-wrap items-center gap-2 text-[12.5px] text-[color:var(--ok)]">
          <span>สร้างสินค้าแล้ว (รหัส {createdId})</span>
          <Button asChild size="sm" variant="outline" className="min-h-[40px]">
            <Link href={`/sale/stocks?shop=${encodeURIComponent(shopId)}`}>ไปที่หน้าสต็อก</Link>
          </Button>
        </p>
      ) : null}
    </div>
  );
}
