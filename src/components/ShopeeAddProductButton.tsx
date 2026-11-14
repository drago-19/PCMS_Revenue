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
    sellerSku: "",
    description: "",
  });

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
      setForm({ itemName: "", price: "", stock: "0", weight: "0.2", categoryKeyword: "", sellerSku: "", description: "" });
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

            <label className="flex flex-col gap-1" htmlFor="shopee-item-category">
              <span className="text-[12px] font-bold">คำค้นหมวดหมู่</span>
              <Input
                id="shopee-item-category"
                value={form.categoryKeyword}
                onChange={(event) => set("categoryKeyword", event.target.value)}
                placeholder="เช่น แก้ว, เสื้อผ้า (เว้นว่างได้)"
                aria-label="คำค้นหมวดหมู่"
                className="h-10"
              />
            </label>

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
