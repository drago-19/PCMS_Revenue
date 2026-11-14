"use client";

import { useRef, useState } from "react";
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

/**
 * สร้างสินค้าใหม่บน Shopee จากหน้านี้
 * รูปถูกส่งไปพร้อมฟอร์ม (multipart) แล้วเซิร์ฟเวอร์อัปโหลดเข้าคลังมีเดียของ Shopee ก่อนสร้างสินค้า
 */
export function ShopeeAddProductButton({ accountKey }: { accountKey: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    itemName: "",
    price: "",
    stock: "0",
    weight: "0.2",
    categoryKeyword: "",
    sellerSku: "",
    description: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("ต้องแนบรูปสินค้า 1 รูป");
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
    body.set("image", file);

    setSaving(true);
    try {
      const response = await fetch("/api/platform/shopee/items", { method: "POST", body });
      const data = (await response.json()) as { error?: string; itemId?: number; category?: string };
      if (!response.ok) {
        toast.error(data.error ?? "สร้างสินค้าไม่สำเร็จ");
        return;
      }
      toast.success(`สร้างสินค้าแล้ว (item ${data.itemId}) หมวด ${data.category ?? "—"}`);
      setOpen(false);
      setForm({ itemName: "", price: "", stock: "0", weight: "0.2", categoryKeyword: "", sellerSku: "", description: "" });
      if (fileRef.current) fileRef.current.value = "";
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-[16px] leading-6">เพิ่มสินค้าใหม่บน Shopee</DialogTitle>
            <DialogDescription className="text-[12px] leading-5">
              สินค้าจะถูกสร้างในร้านที่เชื่อมไว้ทันที — ตรวจดูให้แน่ใจว่าเป็นร้านที่ต้องการ
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold">ชื่อสินค้า *</span>
              <Input
                value={form.itemName}
                onChange={(event) => set("itemName", event.target.value)}
                aria-label="ชื่อสินค้า"
                className="h-10"
                maxLength={120}
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold">ราคา (บาท) *</span>
                <Input
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => set("price", event.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="ราคา"
                  className="h-10"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold">สต็อก *</span>
                <Input
                  inputMode="numeric"
                  value={form.stock}
                  onChange={(event) => set("stock", event.target.value.replace(/[^0-9]/g, ""))}
                  aria-label="จำนวนสต็อก"
                  className="h-10"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold">น้ำหนัก (กก.) *</span>
                <Input
                  inputMode="decimal"
                  value={form.weight}
                  onChange={(event) => set("weight", event.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="น้ำหนัก"
                  className="h-10"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold">คำค้นหมวดหมู่</span>
              <Input
                value={form.categoryKeyword}
                onChange={(event) => set("categoryKeyword", event.target.value)}
                placeholder="เช่น แก้ว, เสื้อผ้า (เว้นว่างได้)"
                aria-label="คำค้นหมวดหมู่"
                className="h-10"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold">รหัสสินค้า (SKU)</span>
              <Input
                value={form.sellerSku}
                onChange={(event) => set("sellerSku", event.target.value)}
                aria-label="รหัสสินค้า"
                className="h-10"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold">รูปสินค้า * (jpg/png ไม่เกิน 2 MB)</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                aria-label="รูปสินค้า"
                className="min-h-10 w-full rounded-md border border-border bg-background px-2 py-2 text-[12.5px]"
              />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={() => setOpen(false)}>
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
