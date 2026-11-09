"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IconDownload,
  IconPlus,
  IconUpload,
} from "@/components/icons";
import { formatTHB } from "@/lib/format";
import type { ProductStockRow } from "@/lib/queries";
import { StockEditDialog } from "./StockEditDialog";
import { StockImportDialog } from "./StockImportDialog";
import { ProductCreateDialog } from "./ProductCreateDialog";

interface StockTableClientProps {
  rows: ProductStockRow[];
  page: number;
  pageSize: number;
}

export function StockTableClient({ rows, page, pageSize }: StockTableClientProps) {
  const [editingProduct, setEditingProduct] = useState<ProductStockRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
          <span>การจัดการสต็อกและไฟล์</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            data-testid="open-product-create-btn"
            onClick={() => setCreateOpen(true)}
            className="h-9 gap-1.5 font-bold shadow-2xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <IconPlus size={15} /> เพิ่มรหัสสินค้าใหม่
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 font-bold shadow-2xs">
            <a href="/api/products/stock-export" download>
              <IconDownload size={15} /> ดาวน์โหลด Excel สต็อก
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="open-stock-import-btn"
            onClick={() => setImportOpen(true)}
            className="h-9 gap-1.5 font-bold shadow-2xs border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
          >
            <IconUpload size={15} /> อัปโหลด Excel อัปเดตสต็อก
          </Button>
        </div>
      </div>

      <ProductCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <StockEditDialog
        product={editingProduct}
        open={Boolean(editingProduct)}
        onOpenChange={(open) => {
          if (!open) setEditingProduct(null);
        }}
      />

      <StockImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

export function StockRowAction({ product }: { product: ProductStockRow }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        data-testid={`edit-stock-${product.skuCode}`}
        onClick={() => setOpen(true)}
        className="h-8 gap-1 px-2.5 font-bold hover:border-primary hover:text-primary"
      >
        <span>✏️ จัดการ</span>
      </Button>
      <StockEditDialog product={product} open={open} onOpenChange={setOpen} />
    </>
  );
}
