"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconDownload,
  IconPlus,
  IconUpload,
} from "@/components/icons";
import type { ProductStockRow } from "@/lib/queries";
import { StockEditDialog } from "./StockEditDialog";
import { StockImportDialog } from "./StockImportDialog";
import { ProductCreateDialog } from "./ProductCreateDialog";

interface StockTableClientProps {
  rows: ProductStockRow[];
  page: number;
  pageSize: number;
  currentDate?: string;
  currentChannel?: string;
  currentQ?: string;
  currentStockFilter?: string;
}

function formatPeriodTitle(dateStr?: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    return `วันที่ ${d}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [y, m] = dateStr.split("-");
    return `เดือน ${m}/${y}`;
  }
  if (/^\d{4}$/.test(dateStr)) {
    return `ปี ${dateStr}`;
  }
  return dateStr;
}

function buildExportUrl(params: {
  date?: string;
  channel?: string;
  q?: string;
  stockFilter?: string;
}) {
  const sp = new URLSearchParams();
  if (params.date) sp.set("date", params.date);
  if (params.channel && params.channel !== "all") sp.set("channel", params.channel);
  if (params.q) sp.set("q", params.q);
  if (params.stockFilter && params.stockFilter !== "all") sp.set("stockFilter", params.stockFilter);
  const qs = sp.toString();
  return qs ? `/api/products/stock-export?${qs}` : "/api/products/stock-export";
}

export function StockTableClient({
  rows,
  page,
  pageSize,
  currentDate,
  currentChannel,
  currentQ,
  currentStockFilter,
}: StockTableClientProps) {
  const [editingProduct, setEditingProduct] = useState<ProductStockRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const formattedPeriod = formatPeriodTitle(currentDate);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-[#f8fafc] px-4 py-2.5 min-[640px]:px-5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
          <span>การจัดการสต็อกและไฟล์</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* ปุ่มเพิ่มรหัสสินค้าใหม่ */}
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

          {/* ปุ่มดาวน์โหลด Excel สต็อก (รองรับทั้งรายเดือน, รายวัน, และตลอดกาล) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 font-bold shadow-2xs hover:border-slate-400"
                data-testid="stock-export-dropdown-btn"
              >
                <IconDownload size={15} />
                <span>
                  {formattedPeriod
                    ? `ดาวน์โหลด Excel (${formattedPeriod})`
                    : "ดาวน์โหลด Excel สต็อก"}
                </span>
                <span className="text-[10px] text-slate-400 ml-0.5">▼</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {currentDate ? (
                <>
                  <DropdownMenuLabel className="text-[11px] font-bold text-slate-500">
                    ดาวน์โหลดตามช่วงเวลาที่เลือก
                  </DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <a
                      href={buildExportUrl({
                        date: currentDate,
                        channel: currentChannel !== "all" ? currentChannel : undefined,
                        q: currentQ || undefined,
                        stockFilter: currentStockFilter !== "all" ? currentStockFilter : undefined,
                      })}
                      download
                      className="flex items-center gap-2 cursor-pointer font-bold text-emerald-700"
                    >
                      <IconDownload size={14} />
                      <div className="flex flex-col">
                        <span>ดาวน์โหลดเฉพาะ {formattedPeriod}</span>
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          แสดงยอดขายและต้นทุนขาย (COGS) ในช่วงนี้
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}

              <DropdownMenuLabel className="text-[11px] font-bold text-slate-500">
                ดาวน์โหลดข้อมูลทั้งหมด
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a
                  href={buildExportUrl({
                    channel: currentChannel !== "all" ? currentChannel : undefined,
                    q: currentQ || undefined,
                    stockFilter: currentStockFilter !== "all" ? currentStockFilter : undefined,
                  })}
                  download
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <IconDownload size={14} />
                  <div className="flex flex-col">
                    <span className="font-bold">ดาวน์โหลดสต็อกทั้งหมด (สะสมตลอดกาล)</span>
                    <span className="text-[10.5px] font-normal text-muted-foreground">
                      แสดงยอดขายสะสมรวมและคงเหลือตลอดกาล
                    </span>
                  </div>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ปุ่มอัปโหลด Excel อัปเดตสต็อก */}
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
