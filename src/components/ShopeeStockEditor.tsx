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

type Action = "set_stock" | "unlist" | "delete";

/**
 * แก้จำนวนสต็อก/ซ่อน/ลบสินค้าบน Shopee โดยตรงจากหน้าสต็อก
 * เขียนแล้วอ่านค่ากลับมาที่หน้านี้ (router.refresh) เพื่อให้เห็นค่าที่ Shopee ตอบจริง
 */
export function ShopeeStockEditor({
  accountKey,
  skuId,
  quantity,
}: {
  accountKey: string;
  skuId: string;
  quantity: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(quantity));
  const [busy, setBusy] = useState<Action | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [price, setPrice] = useState("");
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  async function changeImage(file: File | undefined) {
    if (!file) return;
    setImageBusy(true);
    try {
      const body = new FormData();
      body.set("accountKey", accountKey);
      body.set("itemId", String(itemId));
      body.set("image", file);
      const response = await fetch("/api/platform/shopee/items/image", { method: "POST", body });
      const data = (await response.json()) as { error?: string; imageUrl?: string | null };
      if (!response.ok) {
        toast.error(data.error ?? "เปลี่ยนรูปไม่สำเร็จ");
        return;
      }
      toast.success(
        data.imageUrl ? `เปลี่ยนรูปแล้ว · Shopee เก็บรูป: ${data.imageUrl}` : "เปลี่ยนรูปสินค้าบน Shopee แล้ว",
        { duration: 10000 },
      );
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setImageBusy(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  async function saveItemFields(payload: { price?: number; itemName?: string; description?: string }, done: string) {
    setSavingItem(true);
    try {
      const response = await fetch("/api/platform/shopee/items/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountKey, itemId, modelId, ...payload }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "แก้ไขข้อมูลไม่สำเร็จ");
        return;
      }
      toast.success(done);
      setPrice("");
      setItemName("");
      setDescription("");
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setSavingItem(false);
    }
  }

  const [itemIdRaw, modelIdRaw] = skuId.split(":");
  const itemId = Number.parseInt(itemIdRaw ?? "", 10);
  const modelId = Number.parseInt(modelIdRaw ?? "0", 10);

  async function run(action: Action, payload: Record<string, unknown>, done: string) {
    setBusy(action);
    try {
      const response = await fetch("/api/platform/shopee/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountKey, itemId, modelId, action, ...payload }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "เขียนข้อมูลไป Shopee ไม่สำเร็จ");
        return;
      }
      toast.success(done);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  const nextQuantity = Number.parseInt(value, 10);
  const quantityValid = Number.isInteger(nextQuantity) && nextQuantity >= 0;
  const changed = quantityValid && nextQuantity !== quantity;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <div>
        <h3 className="text-[13px] font-bold">แก้ข้อมูลบน Shopee</h3>
        <p className="text-[12px] leading-5 text-muted-foreground">
          เขียนกลับไปที่ร้านจริงทันที — ตัวเลขบนหน้านี้จะอัปเดตตามค่าที่ Shopee ตอบกลับ
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[12px] font-bold">จำนวนคงเหลือใหม่</span>
          <Input
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))}
            aria-label="จำนวนคงเหลือใหม่บน Shopee"
            className="h-10 w-full max-w-40"
          />
        </label>
        <Button
          type="button"
          className="h-10"
          disabled={!changed || busy !== null}
          onClick={() => run("set_stock", { quantity: nextQuantity }, "อัปเดตสต็อกบน Shopee แล้ว")}
        >
          {busy === "set_stock" ? "กำลังบันทึก…" : "บันทึกจำนวน"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold">ราคาใหม่ (บาท)</span>
          <Input
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="เช่น 159"
            aria-label="ราคาใหม่บน Shopee"
            className="h-10"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="h-10 sm:self-end"
          disabled={savingItem || !price || !Number.isFinite(Number.parseFloat(price))}
          onClick={() => saveItemFields({ price: Number.parseFloat(price) }, "แก้ราคาบน Shopee แล้ว")}
        >
          {savingItem ? "กำลังบันทึก…" : "บันทึกราคา"}
        </Button>
      </div>

      <details className="rounded-lg border border-border bg-background/60 p-2">
        <summary className="cursor-pointer text-[12px] font-bold">แก้ชื่อ / คำอธิบายสินค้า</summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[12px]">ชื่อใหม่ (20–120 ตัวอักษร)</span>
            <Input
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              aria-label="ชื่อสินค้าใหม่"
              className="h-10"
              maxLength={120}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px]">คำอธิบายใหม่ (60–500 ตัวอักษร)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-label="คำอธิบายสินค้าใหม่"
              maxLength={500}
              rows={3}
              className="min-h-20 w-full rounded-md border border-border bg-background px-2 py-2 text-[12.5px]"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-10 self-start"
            disabled={savingItem || (!itemName && !description)}
            onClick={() =>
              saveItemFields(
                { itemName: itemName || undefined, description: description || undefined },
                "บันทึกข้อความบน Shopee แล้ว",
              )
            }
          >
            {savingItem ? "กำลังบันทึก…" : "บันทึกชื่อ/คำอธิบาย"}
          </Button>
        </div>
      </details>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
        <span className="text-[12px] font-bold">เปลี่ยนรูปสินค้า</span>
        <input
          ref={imageRef}
          type="file"
          accept="image/jpeg,image/png"
          aria-label="รูปสินค้าใหม่"
          className="min-h-10 w-full rounded-md border border-border bg-background px-2 py-2 text-[12.5px]"
          onChange={(event) => void changeImage(event.target.files?.[0])}
        />
        <span className="text-[12px] leading-5 text-muted-foreground">
          JPG หรือ PNG ไม่เกิน 2 MB — รูปใหม่จะแทนรูปหลักทันที{imageBusy ? " (กำลังอัปโหลด…)" : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={busy !== null}
          onClick={() => run("unlist", {}, "ซ่อนสินค้าจากหน้าร้านแล้ว")}
        >
          {busy === "unlist" ? "กำลังซ่อน…" : "ซ่อนจากหน้าร้าน"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 text-destructive"
          disabled={busy !== null}
          onClick={() => setAskDelete(true)}
        >
          {busy === "delete" ? "กำลังลบ…" : "ลบสินค้า"}
        </Button>
      </div>

      <Dialog open={askDelete} onOpenChange={setAskDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-[16px] leading-6">ลบสินค้าออกจาก Shopee?</DialogTitle>
            <DialogDescription className="text-[12.5px] leading-5">
              สินค้า {skuId} จะถูกลบถาวรจากร้าน — กู้คืนไม่ได้ และรูป/ประวัติการขายที่ผูกไว้จะหายไปด้วย
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setAskDelete(false)}
              disabled={busy === "delete"}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              className="h-10"
              variant="destructive"
              disabled={busy === "delete"}
              onClick={() => {
                setAskDelete(false);
                void run("delete", {}, "ลบสินค้าออกจาก Shopee แล้ว");
              }}
            >
              {busy === "delete" ? "กำลังลบ…" : "ลบถาวร"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
