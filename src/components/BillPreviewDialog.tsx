"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BillDocument } from "@/components/BillDocument";
import { InvoiceDocument, type InvoiceMode } from "@/components/InvoiceDocument";
import {
  IconCalendar,
  IconFile,
  IconPrinter,
  IconReceipt,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildBill } from "@/lib/bill";
import { buildInvoice } from "@/lib/invoice";
import type { TransactionRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

type PreviewTab = "bill" | "invoice" | "invoice_full";

export function BillPreviewTrigger({
  row,
  defaultTab = "bill",
  triggerVariant = "button",
  label,
  className,
}: {
  row: TransactionRow;
  defaultTab?: PreviewTab;
  triggerVariant?: "button" | "ghost" | "link";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PreviewTab>(defaultTab);
  const [buyerName, setBuyerName] = useState(row.customerName ?? "");
  const [buyerTaxId, setBuyerTaxId] = useState("");
  const [buyerAddress, setBuyerAddress] = useState(row.customerAddress ?? "");

  const bill = useMemo(() => buildBill(row.normalized), [row.normalized]);
  const invoice = useMemo(() => buildInvoice(row), [row]);

  function handleOpen() {
    setTab(defaultTab);
    setBuyerName(row.customerName ?? "");
    setBuyerAddress(row.customerAddress ?? "");
    setOpen(true);
  }

  const invoiceMode: InvoiceMode =
    tab === "invoice_full" ? "full" : "abbreviated";

  const fullPageHref =
    tab === "invoice"
      ? `/invoices/${row.externalId}`
      : tab === "invoice_full"
        ? `/invoices/${row.externalId}?mode=full`
        : `/bills/${row.externalId}`;

  return (
    <>
      {triggerVariant === "link" ? (
        <button
          type="button"
          onClick={handleOpen}
          className={cn(
            "mono link inline-flex min-h-[40px] cursor-pointer items-center text-left max-[640px]:break-all min-[641px]:whitespace-nowrap text-[12.5px] min-[641px]:text-[13px] bg-transparent border-0 p-0",
            className,
          )}
        >
          {label ?? row.externalId}
        </button>
      ) : (
        <Button
          type="button"
          variant={triggerVariant === "ghost" ? "ghost" : "secondary"}
          size="xs"
          onClick={handleOpen}
          className={className}
        >
          {label ??
            (defaultTab === "invoice"
              ? "ใบกำกับฯ"
              : defaultTab === "invoice_full"
                ? "ใบกำกับฯ เต็ม"
                : "ดูบิล")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-border bg-[#f8fafc] px-4 py-3.5 pr-14 text-left sm:px-6 sm:py-4 sm:pr-14">
            <div className="flex flex-col gap-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-extrabold text-foreground sm:text-lg">
                <span>คำสั่งซื้อ #{row.externalId}</span>
                {row.orderCode && row.orderCode !== row.externalId ? (
                  <Badge variant="neutral" size="sm" className="mono">
                    ผูกออเดอร์ #{row.orderCode}
                  </Badge>
                ) : (
                  <span className="text-xs font-normal text-muted-foreground">
                    (ยังไม่ผูก #ออเดอร์ OMS)
                  </span>
                )}
                <Badge
                  variant={
                    row.channel === "Shopee"
                      ? "warning"
                      : row.channel === "Facebook"
                        ? "info"
                        : "default"
                  }
                  size="sm"
                >
                  {row.channel || "TikTok"}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
                สลับดูรายละเอียดบิล ใบกำกับภาษีอย่างย่อ หรือใบกำกับภาษีแบบเต็มรูป พร้อมรายการสินค้าที่แมปได้
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-white px-4 py-2.5 sm:px-6">
            <div
              role="tablist"
              aria-label="เลือกประเภทเอกสาร"
              className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-[#cbd5e1] bg-[#e2e8f0] p-1"
            >
              <Button
                type="button"
                role="tab"
                aria-selected={tab === "bill"}
                variant={tab === "bill" ? "default" : "ghost"}
                size="xs"
                onClick={() => setTab("bill")}
                className={
                  tab === "bill"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]"
                }
              >
                <IconFile size={15} /> รายละเอียดบิล
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={tab === "invoice"}
                variant={tab === "invoice" ? "default" : "ghost"}
                size="xs"
                onClick={() => setTab("invoice")}
                className={
                  tab === "invoice"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]"
                }
              >
                <IconReceipt size={15} /> ใบกำกับฯ (อย่างย่อ)
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={tab === "invoice_full"}
                variant={tab === "invoice_full" ? "default" : "ghost"}
                size="xs"
                onClick={() => setTab("invoice_full")}
                className={
                  tab === "invoice_full"
                    ? "shadow-xs"
                    : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]"
                }
              >
                <IconReceipt size={15} /> ใบกำกับฯ (แบบเต็มรูป)
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {row.paidDate ? (
                <Button asChild variant="outline" size="xs">
                  <Link href={`/days/${row.paidDate}`} onClick={() => setOpen(false)}>
                    <IconCalendar size={14} /> ดูรอบชำระ
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="default" size="xs">
                <Link href={fullPageHref} onClick={() => setOpen(false)}>
                  <IconPrinter size={14} /> เปิดหน้าพิมพ์ / PDF
                </Link>
              </Button>
            </div>
          </div>

          {tab === "invoice_full" ? (
            <div className="no-print border-b border-border bg-[#f8fafc] px-4 py-2.5 sm:px-6">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[#475569]">
                    ชื่อผู้ซื้อ / บริษัท
                  </label>
                  <Input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="ชื่อลูกค้า / บริษัท"
                    className="h-8 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[#475569]">
                    เลขผู้เสียภาษีผู้ซื้อ (ถ้ามี)
                  </label>
                  <Input
                    value={buyerTaxId}
                    onChange={(e) => setBuyerTaxId(e.target.value)}
                    placeholder="เช่น 01055XXXXXXXX (13 หลัก)"
                    className="h-8 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[#475569]">
                    ที่อยู่ผู้ซื้อ
                  </label>
                  <Input
                    value={buyerAddress}
                    onChange={(e) => setBuyerAddress(e.target.value)}
                    placeholder="ที่อยู่สำหรับออกใบกำกับภาษีเต็มรูป"
                    className="h-8 bg-white text-xs"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f1f5f9] p-3 sm:p-5">
            {tab === "bill" ? (
              <BillDocument
                bill={bill}
                invoiceNo={row.invoiceNo}
                channel={row.channel}
                orderCode={row.orderCode}
                customerName={row.customerName}
                trackingNo={row.trackingNo}
                courier={row.courier}
                discountCode={row.discountCode}
                discountTotal={row.discountTotal}
                shippingFeeCustomer={row.shippingFeeCustomer}
                shippingFeeSeller={row.shippingFeeSeller}
                marketplaceOrderRaw={row.marketplaceOrderRaw}
                productDetail={row.productDetail}
                omsItems={row.omsItems}
                source={{
                  filename: row.importFilename ?? "ไฟล์นำเข้าระบบ",
                  importedAt: row.importImportedAt ?? row.createdAt,
                  importId: row.importId,
                }}
              />
            ) : (
              <InvoiceDocument
                invoice={invoice}
                mode={invoiceMode}
                buyerOverride={
                  tab === "invoice_full"
                    ? {
                        name: buyerName || row.customerName || null,
                        taxId: buyerTaxId || null,
                        address: buyerAddress || row.customerAddress || null,
                      }
                    : undefined
                }
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
