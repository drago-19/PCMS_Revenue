"use client";

import { useState } from "react";
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
import { formatTHB } from "@/lib/format";
import { IconPlus, IconReceipt, IconWallet } from "@/components/icons";

interface ProductCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductCreateDialog({ open, onOpenChange }: ProductCreateDialogProps) {
  const router = useRouter();
  const [skuCode, setSkuCode] = useState("");
  const [productName, setProductName] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [stockIn, setStockIn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Calculations for live preview
  const numCost = Math.max(0, Number(costPrice) || 0);
  const numDefaultPrice = Math.max(0, Number(defaultPrice) || 0);
  const numInitial = Math.max(0, Math.round(Number(initialStock) || 0));
  const numStockIn = Math.max(0, Math.round(Number(stockIn) || 0));
  const totalStock = numInitial + numStockIn;
  const stockValue = totalStock * numCost;

  function resetForm() {
    setSkuCode("");
    setProductName("");
    setDefaultPrice("");
    setCostPrice("");
    setInitialStock("");
    setStockIn("");
    setNote("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanSku = skuCode.trim();
    const cleanName = productName.trim();

    if (!cleanSku) {
      toast.error("กรุณาระบุรหัสสินค้า (SKU)");
      return;
    }
    if (!cleanName) {
      toast.error("กรุณาระบุชื่อสินค้า");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuCode: cleanSku,
          productName: cleanName,
          defaultPrice: numDefaultPrice,
          costPrice: numCost,
          initialStock: numInitial,
          stockIn: numStockIn,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || "เพิ่มรหัสสินค้าไม่สำเร็จ");
        return;
      }

      toast.success(`เพิ่มรหัสสินค้า '${cleanSku}' สำเร็จ`);
      resetForm();
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[560px] p-6 sm:max-w-[560px]">
        <DialogHeader className="pr-11">
          <DialogTitle className="flex items-center gap-2 text-base font-extrabold text-[#0f172a]">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <IconPlus size={16} />
            </span>
            เพิ่มรหัสสินค้าใหม่
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-[#64748b]">
            ระบุรหัสสินค้า (SKU) และชื่อสินค้า พร้อมกำหนดราคาทุนและจำนวนสต็อกเริ่มต้น
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-3 space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {/* รหัสสินค้า (SKU) */}
            <div className="sm:col-span-1">
              <label
                htmlFor="create-sku-code"
                className="mb-1 block text-xs font-bold text-[#0f172a]"
              >
                รหัสสินค้า (SKU) <span className="text-red-500">*</span>
              </label>
              <Input
                id="create-sku-code"
                type="text"
                autoFocus
                placeholder="เช่น 1SK-MK-1-L"
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                required
                className="h-9.5 text-xs font-mono font-bold"
              />
            </div>

            {/* ราคาขายหน้าร้าน */}
            <div className="sm:col-span-1">
              <label
                htmlFor="create-default-price"
                className="mb-1 block text-xs font-bold text-[#0f172a]"
              >
                ราคาขายตั้งต้น (฿)
              </label>
              <Input
                id="create-default-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                className="h-9.5 text-xs font-mono"
              />
            </div>

            {/* ชื่อสินค้า */}
            <div className="sm:col-span-2">
              <label
                htmlFor="create-product-name"
                className="mb-1 block text-xs font-bold text-[#0f172a]"
              >
                ชื่อสินค้า <span className="text-red-500">*</span>
              </label>
              <Input
                id="create-product-name"
                type="text"
                placeholder="เช่น กระโปรงทรงเอ ลายเจ้าหญิง (L)"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
                className="h-9.5 text-xs"
              />
            </div>

            {/* ราคาทุน/ชิ้น */}
            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="create-cost-price"
                    className="mb-1 block text-xs font-bold text-[#0f172a]"
                  >
                    ราคาทุน/ชิ้น (฿)
                  </label>
                  <Input
                    id="create-cost-price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="h-9 text-xs font-mono bg-white"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    ใช้คำนวณต้นทุนขาย (COGS)
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="create-initial-stock"
                    className="mb-1 block text-xs font-bold text-[#0f172a]"
                  >
                    สต็อกตั้งต้น (ตัว)
                  </label>
                  <Input
                    id="create-initial-stock"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(e.target.value)}
                    className="h-9 text-xs font-mono bg-white"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    ยอดยกมาเริ่มต้น
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="create-stock-in"
                    className="mb-1 block text-xs font-bold text-[#0f172a]"
                  >
                    ของเข้าเพิ่ม (ตัว)
                  </label>
                  <Input
                    id="create-stock-in"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={stockIn}
                    onChange={(e) => setStockIn(e.target.value)}
                    className="h-9 text-xs font-mono bg-white"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    รับเข้าสต็อกล็อตนี้
                  </span>
                </div>
              </div>
            </div>

            {/* หมายเหตุ */}
            <div className="sm:col-span-2">
              <label
                htmlFor="create-note"
                className="mb-1 block text-xs font-bold text-[#0f172a]"
              >
                หมายเหตุการบันทึก
              </label>
              <Input
                id="create-note"
                type="text"
                placeholder="เช่น สินค้าล็อตเปิดตัว / ล็อตสั่งตัดเพิ่ม"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Real-time Summary Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-xs text-[#065f46]">
            <div className="font-bold text-[#047857] mb-1.5 flex items-center gap-1.5">
              <span>ตัวอย่างการบันทึกสต็อกเริ่มต้น:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 border border-emerald-100">
                <span className="text-[#64748b]">สต็อกคงเหลือเริ่มต้น:</span>
                <span className="font-mono font-bold text-[#0f172a]">
                  {totalStock.toLocaleString("th-TH")} ตัว
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 border border-emerald-100">
                <span className="text-[#64748b]">มูลค่าสต็อกรวม:</span>
                <span className="font-mono font-bold text-[#0f172a]">
                  {formatTHB(stockValue)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-5 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-9.5 text-xs font-bold"
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={saving}
              className="h-9.5 gap-1.5 text-xs font-bold shadow-2xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <IconPlus size={15} />
              {saving ? "กำลังบันทึก..." : "บันทึกรหัสสินค้าใหม่"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
