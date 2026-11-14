"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
          onClick={() => {
            if (!window.confirm("ลบสินค้านี้ออกจาก Shopee ถาวร? กู้คืนไม่ได้")) return;
            void run("delete", {}, "ลบสินค้าออกจาก Shopee แล้ว");
          }}
        >
          {busy === "delete" ? "กำลังลบ…" : "ลบสินค้า"}
        </Button>
      </div>
    </div>
  );
}
