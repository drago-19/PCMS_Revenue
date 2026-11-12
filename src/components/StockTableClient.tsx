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
  onlySold?: boolean;
}) {
  const sp = new URLSearchParams();
  if (params.date) sp.set("date", params.date);
  if (params.channel && params.channel !== "all") sp.set("channel", params.channel);
  if (params.q) sp.set("q", params.q);
  if (params.stockFilter && params.stockFilter !== "all") sp.set("stockFilter", params.stockFilter);
  if (params.onlySold) sp.set("onlySold", "true");
  const qs = sp.toString();
  return qs ? `/api/products/stock-export?${qs}` : "/api/products/stock-export";
}

export function StockTableClient({
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
            <DropdownMenuContent align="end" className="w-[calc(100vw-32px)] max-w-[350px] p-2">
              {currentDate ? (
                <>
                  <DropdownMenuLabel className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    สำหรับ {formattedPeriod}
                  </DropdownMenuLabel>

                  {/* ตัวเลือกที่ 1: เฉพาะสินค้าที่ขายได้ (สำหรับบัญชี COGS) */}
                  <DropdownMenuItem asChild>
                    <a
                      href={buildExportUrl({
                        date: currentDate,
                        channel: currentChannel !== "all" ? currentChannel : undefined,
                        q: currentQ || undefined,
                        stockFilter: currentStockFilter !== "all" ? currentStockFilter : undefined,
                        onlySold: true,
                      })}
                      download
                      data-testid="stock-export-sold-only-btn"
                      className="flex items-start gap-2.5 rounded-lg p-2.5 cursor-pointer hover:bg-emerald-50 focus:bg-emerald-50 border border-emerald-200/80 bg-emerald-50/50 my-1 transition-colors"
                    >
                      <div className="mt-0.5 rounded-md p-1.5 bg-emerald-600 text-white shrink-0 shadow-2xs">
                        <IconDownload size={14} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-emerald-950">
                            1. เฉพาะสินค้าที่ขายได้
                          </span>
                          <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                            แนะนำสำหรับบัญชี
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-800 leading-snug">
                          โชว์เฉพาะตัวที่ขายได้จริง (ตัดตัวที่ขาย 0 ออก ดูยอดต้นทุนขาย COGS ง่ายๆ)
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>

                  {/* ตัวเลือกที่ 2: สินค้าทั้งหมดในคลัง */}
                  <DropdownMenuItem asChild>
                    <a
                      href={buildExportUrl({
                        date: currentDate,
                        channel: currentChannel !== "all" ? currentChannel : undefined,
                        q: currentQ || undefined,
                        stockFilter: currentStockFilter !== "all" ? currentStockFilter : undefined,
                        onlySold: false,
                      })}
                      download
                      data-testid="stock-export-all-items-btn"
                      className="flex items-start gap-2.5 rounded-lg p-2.5 cursor-pointer hover:bg-slate-100 focus:bg-slate-100 border border-transparent my-1 transition-colors"
                    >
                      <div className="mt-0.5 rounded-md p-1.5 bg-slate-200 text-slate-700 shrink-0">
                        <IconDownload size={14} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-xs text-slate-900">
                          2. สินค้าทั้งหมดในคลัง (ครบทุก SKU)
                        </span>
                        <span className="text-[11px] text-slate-500 leading-snug">
                          โชว์สินค้าครบทุกรหัสในระบบ พร้อมยอดขายช่วงนี้และสต็อกคงเหลือ
                        </span>
                      </div>
                    </a>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="my-1.5" />
                </>
              ) : null}

              <DropdownMenuLabel className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                ข้อมูลภาพรวมตลอดกาล (ทุกช่วงเวลา)
              </DropdownMenuLabel>

              <DropdownMenuItem asChild>
                <a
                  href={buildExportUrl({
                    channel: currentChannel !== "all" ? currentChannel : undefined,
                    q: currentQ || undefined,
                    stockFilter: currentStockFilter !== "all" ? currentStockFilter : undefined,
                    onlySold: true,
                  })}
                  download
                  className="flex items-start gap-2.5 rounded-lg p-2 cursor-pointer hover:bg-slate-100 focus:bg-slate-100 transition-colors"
                >
                  <div className="mt-0.5 rounded-md p-1.5 bg-slate-100 text-slate-600 shrink-0">
                    <IconDownload size={14} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-xs text-slate-800">
                      เฉพาะสินค้าที่เคยขายได้ (สะสมตลอดกาล)
                    </span>
                    <span className="text-[11px] text-slate-500 leading-snug">
                      ตัดรหัสสินค้าที่ไม่เคยมีการขายออก
                    </span>
                  </div>
                </a>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <a
                  href={buildExportUrl({
                    channel: currentChannel !== "all" ? currentChannel : undefined,
                    q: currentQ || undefined,
                    stockFilter: currentStockFilter !== "all" ? currentStockFilter : undefined,
                    onlySold: false,
                  })}
                  download
                  className="flex items-start gap-2.5 rounded-lg p-2 cursor-pointer hover:bg-slate-100 focus:bg-slate-100 transition-colors"
                >
                  <div className="mt-0.5 rounded-md p-1.5 bg-slate-100 text-slate-600 shrink-0">
                    <IconDownload size={14} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-xs text-slate-800">
                      สต็อกสินค้าทั้งหมดในระบบ (สะสมตลอดกาล)
                    </span>
                    <span className="text-[11px] text-slate-500 leading-snug">
                      โชว์สินค้าครบทุกรหัสในระบบ พร้อมยอดขายสะสมและมูลค่าคงเหลือรวม
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
