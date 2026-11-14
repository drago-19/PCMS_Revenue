"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Shopee แนะนำรูป 1:1 และด้านละอย่างน้อย 500 px — เตือนก่อนอัปโหลด แต่ไม่บล็อก */
const MIN_SIDE = 500;

interface PickedImage {
  file: File;
  url: string;
  width: number;
  height: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * สร้างสินค้าใหม่บน Shopee จากหน้านี้
 * รูปถูกส่งไปพร้อมฟอร์ม (multipart) แล้วเซิร์ฟเวอร์อัปโหลดเข้าคลังมีเดียของ Shopee ก่อนสร้างสินค้า
 */
export function ShopeeAddProductButton({ accountKey }: { accountKey: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [form, setForm] = useState({
    itemName: "",
    price: "",
    stock: "0",
    weight: "0.2",
    categoryKeyword: "",
    categoryId: "",
    categoryName: "",
    brandName: "No Brand",
    sellerSku: "",
    description: "",
  });
  const [categoryResults, setCategoryResults] = useState<Array<{ id: number; name: string }>>([]);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [models, setModels] = useState<Array<{ label: string; price: string; stock: string }>>([]);

  async function searchCategories() {
    setCategoryBusy(true);
    try {
      const response = await fetch(
        `/api/platform/shopee/categories?q=${encodeURIComponent(form.categoryKeyword.trim())}`,
      );
      const data = (await response.json()) as { items?: Array<{ id: number; name: string }>; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "ค้นหมวดหมู่ไม่สำเร็จ");
        return;
      }
      setCategoryResults(data.items ?? []);
      if ((data.items ?? []).length === 0) toast.error("ไม่พบหมวดหมู่ที่ตรงกับคำค้น");
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setCategoryBusy(false);
    }
  }

  // คืนหน่วยความจำของ URL ชั่วคราวเมื่อรูปเปลี่ยนหรือปิดฟอร์ม
  useEffect(() => {
    return () => {
      if (picked) URL.revokeObjectURL(picked.url);
    };
  }, [picked]);

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFile(file: File | null | undefined) {
    setImageError(null);
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
      setImageError("รองรับเฉพาะไฟล์ JPG หรือ PNG");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`ไฟล์ใหญ่ ${formatBytes(file.size)} — Shopee รับไม่เกิน 2 MB`);
      return;
    }

    const url = URL.createObjectURL(file);
    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => resolve({ width: 0, height: 0 });
      probe.src = url;
    });

    setPicked({ file, url, width: size.width, height: size.height });
  }

  function clearImage() {
    setPicked(null);
    setImageError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function closeDialog() {
    setOpen(false);
    clearImage();
  }

  const ratioWarning =
    picked && picked.width > 0 && picked.height > 0
      ? picked.width !== picked.height
        ? `รูปนี้ ${picked.width}×${picked.height} ไม่ใช่จัตุรัส (1:1) — Shopee จะครอปให้เอง`
        : picked.width < MIN_SIDE
          ? `ด้านสั้นสุด ${Math.min(picked.width, picked.height)} px — Shopee แนะนำอย่างน้อย ${MIN_SIDE}×${MIN_SIDE}`
          : null
      : null;

  async function submit() {
    if (!picked) {
      setImageError("ต้องแนบรูปสินค้า 1 รูป");
      return;
    }

    const body = new FormData();
    body.set("accountKey", accountKey);
    body.set("itemName", form.itemName);
    body.set("price", form.price);
    body.set("stock", form.stock);
    body.set("weight", form.weight);
    body.set("categoryKeyword", form.categoryKeyword);
    body.set("categoryId", form.categoryId);
    body.set("brandName", form.brandName);
    if (models.length > 0) {
      body.set(
        "models",
        JSON.stringify(models.map((row) => ({ label: row.label, price: Number(row.price), stock: Number(row.stock) }))),
      );
    }
    body.set("sellerSku", form.sellerSku);
    body.set("description", form.description);
    body.set("image", picked.file);

    setSaving(true);
    try {
      const response = await fetch("/api/platform/shopee/items", { method: "POST", body });
      const data = (await response.json()) as { error?: string; itemId?: number; category?: string };
      if (!response.ok) {
        toast.error(data.error ?? "สร้างสินค้าไม่สำเร็จ");
        return;
      }
      toast.success(`สร้างสินค้าแล้ว (item ${data.itemId}) หมวด ${data.category ?? "—"}`);
      closeDialog();
      setForm({
        itemName: "",
        price: "",
        stock: "0",
        weight: "0.2",
        categoryKeyword: "",
        categoryId: "",
        categoryName: "",
        brandName: "No Brand",
        sellerSku: "",
        description: "",
      });
      setModels([]);
      setCategoryResults([]);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" className="h-10" onClick={() => setOpen(true)}>
        เพิ่มสินค้าใหม่
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else closeDialog();
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-[16px] leading-6">เพิ่มสินค้าใหม่บน Shopee</DialogTitle>
            <DialogDescription className="text-[12px] leading-5">
              สินค้าจะถูกสร้างในร้านที่เชื่อมไว้ทันที — ตรวจดูให้แน่ใจว่าเป็นร้านที่ต้องการ
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1" htmlFor="shopee-item-name">
              <span className="text-[12px] font-bold">
                ชื่อสินค้า <span aria-hidden="true">*</span>
              </span>
              <Input
                id="shopee-item-name"
                value={form.itemName}
                onChange={(event) => set("itemName", event.target.value)}
                aria-label="ชื่อสินค้า"
                aria-describedby="shopee-name-hint"
                className="h-10"
                minLength={20}
                maxLength={120}
                required
              />
              <span
                id="shopee-name-hint"
                className={cn(
                  "text-[12px] leading-5",
                  form.itemName.length > 0 && form.itemName.length < 20
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
              >
                Shopee ต้องการ 20–120 ตัวอักษร ({form.itemName.length}/120)
              </span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1" htmlFor="shopee-item-price">
                <span className="text-[12px] font-bold">
                  ราคา (บาท) <span aria-hidden="true">*</span>
                </span>
                <Input
                  id="shopee-item-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => set("price", event.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="ราคา"
                  className="h-10"
                  required
                />
              </label>
              <label className="flex flex-col gap-1" htmlFor="shopee-item-stock">
                <span className="text-[12px] font-bold">
                  สต็อก <span aria-hidden="true">*</span>
                </span>
                <Input
                  id="shopee-item-stock"
                  inputMode="numeric"
                  value={form.stock}
                  onChange={(event) => set("stock", event.target.value.replace(/[^0-9]/g, ""))}
                  aria-label="จำนวนสต็อก"
                  className="h-10"
                  required
                />
              </label>
              <label className="flex flex-col gap-1" htmlFor="shopee-item-weight">
                <span className="text-[12px] font-bold">
                  น้ำหนัก (กก.) <span aria-hidden="true">*</span>
                </span>
                <Input
                  id="shopee-item-weight"
                  inputMode="decimal"
                  value={form.weight}
                  onChange={(event) => set("weight", event.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="น้ำหนัก"
                  className="h-10"
                  required
                />
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold">หมวดหมู่สินค้า</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={form.categoryKeyword}
                  onChange={(event) => set("categoryKeyword", event.target.value)}
                  placeholder="ค้นหมวด เช่น แก้ว, เสื้อผ้า"
                  aria-label="ค้นหมวดหมู่สินค้า"
                  className="h-10 min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={categoryBusy}
                  onClick={() => void searchCategories()}
                >
                  {categoryBusy ? "กำลังค้น…" : "ค้นหมวด"}
                </Button>
              </div>
              {form.categoryId ? (
                <p className="text-[12px] leading-5 text-muted-foreground">
                  เลือกไว้: {form.categoryName} (id {form.categoryId}) — ถ้าไม่เลือก ระบบจะเลือกหมวดให้อัตโนมัติ
                </p>
              ) : (
                <p className="text-[12px] leading-5 text-muted-foreground">
                  ไม่เลือกก็ได้ ระบบจะเลือกหมวดใบแรกที่ตรงกับคำค้นให้
                </p>
              )}
              {categoryResults.length > 0 ? (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
                  {categoryResults.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={cn(
                        "min-h-10 rounded-md px-2 text-left text-[12.5px]",
                        String(row.id) === form.categoryId ? "bg-primary/10 font-bold" : "hover:bg-muted",
                      )}
                      onClick={() => {
                        setForm((prev) => ({ ...prev, categoryId: String(row.id), categoryName: row.name }));
                        setCategoryResults([]);
                      }}
                    >
                      {row.name} <span className="text-muted-foreground">#{row.id}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="flex flex-col gap-1" htmlFor="shopee-item-brand">
              <span className="text-[12px] font-bold">แบรนด์</span>
              <Input
                id="shopee-item-brand"
                value={form.brandName}
                onChange={(event) => set("brandName", event.target.value)}
                aria-label="แบรนด์"
                className="h-10"
                maxLength={60}
              />
              <span className="text-[12px] leading-5 text-muted-foreground">
                ค่าเริ่มต้น “No Brand” — Shopee บังคับต้องมีแบรนด์
              </span>
            </label>

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-bold">ตัวเลือกสินค้า (เช่น ไซส์/สี)</span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={models.length >= 20}
                  onClick={() => setModels((prev) => [...prev, { label: "", price: form.price || "0", stock: "0" }])}
                >
                  เพิ่มตัวเลือก
                </Button>
              </div>
              {models.length === 0 ? (
                <span className="text-[12px] leading-5 text-muted-foreground">
                  ถ้าไม่เพิ่ม ระบบจะสร้างสินค้าแบบไม่มีตัวเลือกโดยใช้ราคา/สต็อกด้านบน
                </span>
              ) : (
                <div className="flex flex-col gap-2">
                  {models.map((row, index) => (
                    <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]">
                      <Input
                        value={row.label}
                        onChange={(event) =>
                          setModels((prev) => prev.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))
                        }
                        placeholder="ชื่อตัวเลือก เช่น M / สีขาว"
                        aria-label={`ชื่อตัวเลือกที่ ${index + 1}`}
                        className="h-10"
                        maxLength={20}
                      />
                      <Input
                        inputMode="decimal"
                        value={row.price}
                        onChange={(event) =>
                          setModels((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, price: event.target.value.replace(/[^0-9.]/g, "") } : item,
                            ),
                          )
                        }
                        placeholder="ราคา"
                        aria-label={`ราคาของตัวเลือกที่ ${index + 1}`}
                        className="h-10"
                      />
                      <Input
                        inputMode="numeric"
                        value={row.stock}
                        onChange={(event) =>
                          setModels((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, stock: event.target.value.replace(/[^0-9]/g, "") } : item,
                            ),
                          )
                        }
                        placeholder="สต็อก"
                        aria-label={`สต็อกของตัวเลือกที่ ${index + 1}`}
                        className="h-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10"
                        onClick={() => setModels((prev) => prev.filter((_, i) => i !== index))}
                      >
                        ลบ
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1" htmlFor="shopee-item-sku">
              <span className="text-[12px] font-bold">รหัสสินค้า (SKU)</span>
              <Input
                id="shopee-item-sku"
                value={form.sellerSku}
                onChange={(event) => set("sellerSku", event.target.value)}
                aria-label="รหัสสินค้า"
                className="h-10"
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-bold">
                รูปสินค้า <span aria-hidden="true">*</span>
              </span>

              <input
                ref={fileRef}
                id="shopee-item-image"
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                aria-describedby={imageError ? "shopee-image-error" : "shopee-image-hint"}
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />

              {picked ? (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                  {/* ตัวอย่างรูปก่อนกดสร้าง — ใช้ object URL ที่เพิ่งเลือก */}
                  <img
                    src={picked.url}
                    alt="ตัวอย่างรูปสินค้าที่เลือก"
                    className="size-20 shrink-0 rounded-md border border-border object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="truncate text-[12.5px] font-bold">{picked.file.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {picked.width}×{picked.height} px · {formatBytes(picked.file.size)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        onClick={() => fileRef.current?.click()}
                      >
                        เปลี่ยนรูป
                      </Button>
                      <Button type="button" variant="ghost" className="h-10" onClick={clearImage}>
                        ลบรูป
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="shopee-item-image"
                  className={cn(
                    "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center transition-colors",
                    "hover:border-primary/60 hover:bg-muted/50 focus-within:border-primary",
                    imageError ? "border-destructive bg-destructive/5" : null,
                  )}
                >
                  <span className="text-[12.5px] font-bold text-foreground">เลือกรูปสินค้า</span>
                  <span className="text-[12px] text-muted-foreground">
                    JPG หรือ PNG · แนะนำ 1000×1000 px (1:1) · ไม่เกิน 2 MB
                  </span>
                </label>
              )}

              {ratioWarning ? (
                <p id="shopee-image-hint" className="text-[12px] leading-5 text-amber-600 dark:text-amber-400">
                  {ratioWarning}
                </p>
              ) : (
                <p id="shopee-image-hint" className="text-[12px] leading-5 text-muted-foreground">
                  Shopee ใช้รูป 1:1 ด้านละอย่างน้อย 500 px — ถ้าไม่ตรงระบบจะเตือนแต่ยังอัปโหลดได้
                </p>
              )}
              {imageError ? (
                <p id="shopee-image-error" role="alert" className="text-[12px] leading-5 text-destructive">
                  {imageError}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button type="button" className="h-10" disabled={saving} onClick={() => void submit()}>
              {saving ? "กำลังสร้าง…" : "สร้างสินค้า"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
