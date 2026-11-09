"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { formatTHB } from "@/lib/format";
import type { ProductStockRow } from "@/lib/queries";
import { IconReceipt, IconTrash, IconWallet } from "@/components/icons";

interface StockEditDialogProps {
  product: ProductStockRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockEditDialog({
  product,
  open,
  onOpenChange,
}: StockEditDialogProps) {
  const router = useRouter();
  const [productName, setProductName] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");
  const [initialStock, setInitialStock] = useState<string>("");
  const [stockIn, setStockIn] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // When product changes, sync state
  const currentSku = product?.skuCode;
  const [lastSyncedSku, setLastSyncedSku] = useState<string | null>(null);

  if (product && product.skuCode !== lastSyncedSku) {
    setLastSyncedSku(product.skuCode);
    setProductName(product.productName || "");
    setCostPrice(product.costPrice > 0 ? String(product.costPrice) : "");
    setInitialStock(product.initialStock > 0 ? String(product.initialStock) : "0");
    setStockIn(product.stockIn > 0 ? String(product.stockIn) : "0");
    setNote("");
  }

  if (!product) return null;

  const numCost = Math.max(0, Number(costPrice) || 0);
  const numInitial = Math.max(0, Math.round(Number(initialStock) || 0));
  const numStockIn = Math.max(0, Math.round(Number(stockIn) || 0));
  const totalAvailable = numInitial + numStockIn;
  const remaining = totalAvailable - product.totalSoldAllTime;
  const stockValue = remaining > 0 ? remaining * numCost : 0;

  async function handleDelete() {
    if (!product) return;
    if (!confirm(`คุณต้องการลบรหัสสินค้า '${product.skuCode}' (${product.productName}) ใช่หรือไม่?`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.skuCode)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || "ไม่สามารถลบรหัสสินค้านี้ได้");
        return;
      }

      toast.success(`ลบรหัสสินค้า '${product.skuCode}' เรียบร้อยแล้ว`);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.skuCode)}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim() || undefined,
          costPrice: numCost,
          initialStock: numInitial,
          stockIn: numStockIn,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || "บันทึกสต็อกไม่สำเร็จ");
        return;
      }

      toast.success(`อัปเดตสต็อก ${product.skuCode} สำเร็จ`);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="pr-12 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-bold text-[#0f172a]">
                จัดการสต็อกและต้นทุนสินค้า
              </DialogTitle>
              <Badge variant="outline" className="mono text-xs font-bold text-primary">
                {product.skuCode}
              </Badge>
            </div>
            <DialogDescription className="mt-1 line-clamp-2 text-xs text-[#64748b]">
              {product.productName}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Edit product name */}
            <div className="space-y-1.5">
              <label htmlFor="stock-edit-name" className="text-xs font-bold text-[#334155]">
                ชื่อสินค้า
              </label>
              <Input
                id="stock-edit-name"
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="ชื่อสินค้า"
                className="text-xs"
              />
            </div>

            {/* Sales summary pill */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
              <div className="flex items-center gap-2 text-[#475569]">
                <IconReceipt size={16} className="text-slate-500" />
                <span>ขายสะสมแล้วทั้งหมด:</span>
              </div>
              <span className="mono font-extrabold text-[#0f172a]">
                {product.totalSoldAllTime.toLocaleString("th-TH")} ตัว
              </span>
            </div>

            {/* Inputs grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="stock-cost" className="text-xs font-bold text-[#334155]">
                  ราคาทุน/ชิ้น (฿)
                </label>
                <Input
                  id="stock-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-[#64748b]">ทุนต่อตัวคงที่</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="stock-initial" className="text-xs font-bold text-[#334155]">
                  สต็อกตั้งต้น (ตัว)
                </label>
                <Input
                  id="stock-initial"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-[#64748b]">ยอดยกมาเริ่มต้น</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="stock-in" className="text-xs font-bold text-[#334155]">
                  ของเข้ารวม (ตัว)
                </label>
                <Input
                  id="stock-in"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="0"
                  value={stockIn}
                  onChange={(e) => setStockIn(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-[#64748b]">ยอดรับเข้าเพิ่ม</p>
              </div>
            </div>

            {/* Note input */}
            <div className="space-y-1.5">
              <label htmlFor="stock-note" className="text-xs font-medium text-[#475569]">
                หมายเหตุการปรับยอด (ไม่บังคับ)
              </label>
              <Input
                id="stock-note"
                type="text"
                placeholder="เช่น สั่งผลิตล็อตเพิ่ม, ปรับยอดสต็อกรายเดือน"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Calculated preview box */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-[#1e293b]">
              <div className="mb-2 flex items-center justify-between border-b border-indigo-100/80 pb-2">
                <span className="font-bold text-[#4338ca]">สรุปผลการคำนวณใหม่:</span>
                <span className="text-[11px] text-[#6366f1]">
                  (ตั้งต้น {numInitial} + เข้า {numStockIn}) - ขาย {product.totalSoldAllTime}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[11.5px] text-[#64748b]">สต็อกคงเหลือใหม่:</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className={`mono text-base font-extrabold ${
                        remaining > 10
                          ? "text-emerald-600"
                          : remaining > 0
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}
                    >
                      {remaining.toLocaleString("th-TH")} ตัว
                    </span>
                    <Badge
                      variant={
                        remaining > 10
                          ? "success"
                          : remaining > 0
                            ? "warning"
                            : "danger"
                      }
                      size="sm"
                    >
                      {remaining > 10
                        ? "มีของ"
                        : remaining > 0
                          ? "ใกล้หมด"
                          : remaining === 0
                            ? "หมด"
                            : "ติดลบ"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-[11.5px] text-[#64748b]">มูลค่าสต็อกคงเหลือ:</span>
                  <div className="mt-0.5 flex items-center gap-1">
                    <IconWallet size={15} className="text-indigo-600" />
                    <span className="mono text-base font-extrabold text-indigo-700">
                      {formatTHB(stockValue)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-5 flex items-center justify-between gap-2">
            {product.totalSoldAllTime === 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={saving}
                className="h-9 px-2 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <IconTrash size={14} className="mr-1" /> ลบรหัสสินค้านี้
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึกสต็อก"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
