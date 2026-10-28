"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon, SaveIcon } from "lucide-react";
import { BillDocument } from "@/components/BillDocument";
import {
  InvoiceDocument,
  type InvoiceMode,
  type InvoicePaperSize,
} from "@/components/InvoiceDocument";
import { InvoiceZoomControl } from "@/components/InvoiceZoomControl";
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
  triggerVariant?: "button" | "ghost" | "outline" | "link";
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PreviewTab>(defaultTab);
  const [paperSize, setPaperSize] = useState<InvoicePaperSize>(
    row.sellerSettings?.defaultPaperSize ?? "a6",
  );

  const [persistedBuyer, setPersistedBuyer] = useState(() => ({
    name: row.buyerName ?? row.customerName ?? "",
    taxId: row.buyerTaxId ?? "",
    address: row.buyerAddress ?? row.customerAddress ?? "",
  }));

  const [buyerName, setBuyerName] = useState(persistedBuyer.name);
  const [buyerTaxId, setBuyerTaxId] = useState(persistedBuyer.taxId);
  const [buyerAddress, setBuyerAddress] = useState(persistedBuyer.address);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [navigatingPrint, setNavigatingPrint] = useState(false);

  const latestInputsRef = useRef({
    name: buyerName,
    taxId: buyerTaxId,
    address: buyerAddress,
  });
  latestInputsRef.current = {
    name: buyerName,
    taxId: buyerTaxId,
    address: buyerAddress,
  };

  const isDirty =
    buyerName.trim() !== persistedBuyer.name.trim() ||
    buyerTaxId.trim() !== persistedBuyer.taxId.trim() ||
    buyerAddress.trim() !== persistedBuyer.address.trim();

  const saveBuyerToDb = useCallback(
    async (values?: { name: string; taxId: string; address: string }) => {
      const target = values ?? latestInputsRef.current;
      setSaveState("saving");
      try {
        const res = await fetch(
          `/api/invoices/${encodeURIComponent(row.externalId)}/buyer`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyerName: target.name,
              buyerTaxId: target.taxId,
              buyerAddress: target.address,
            }),
          },
        );
        if (!res.ok) {
          setSaveState("error");
          return false;
        }
        setPersistedBuyer({
          name: target.name.trim(),
          taxId: target.taxId.trim(),
          address: target.address.trim(),
        });
        setSaveState("saved");
        return true;
      } catch {
        setSaveState("error");
        return false;
      }
    },
    [row.externalId],
  );

  useEffect(() => {
    if (!open || tab !== "invoice_full" || !isDirty) return;
    const timer = window.setTimeout(() => {
      void saveBuyerToDb();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [open, tab, isDirty, buyerName, buyerTaxId, buyerAddress, saveBuyerToDb]);

  const bill = useMemo(() => buildBill(row.normalized), [row.normalized]);
  const invoice = useMemo(() => buildInvoice(row), [row]);

  function handleOpen() {
    setTab(defaultTab);
    setBuyerName(persistedBuyer.name);
    setBuyerTaxId(persistedBuyer.taxId);
    setBuyerAddress(persistedBuyer.address);
    setSaveState("idle");
    setOpen(true);
  }

  const invoiceMode: InvoiceMode =
    tab === "invoice_full" ? "full" : "abbreviated";

  const fullPageHref =
    tab === "invoice"
      ? paperSize === "a6"
        ? `/invoices/${row.externalId}`
        : `/invoices/${row.externalId}?paper=${paperSize}`
      : tab === "invoice_full"
        ? `/invoices/${row.externalId}?mode=full`
        : `/bills/${row.externalId}`;

  async function handleOpenFullPage(e: React.MouseEvent<HTMLAnchorElement>) {
    if (tab === "invoice_full") {
      e.preventDefault();
      setNavigatingPrint(true);
      await saveBuyerToDb({
        name: latestInputsRef.current.name,
        taxId: latestInputsRef.current.taxId,
        address: latestInputsRef.current.address,
      });
      setNavigatingPrint(false);
      setOpen(false);
      router.push(fullPageHref);
      router.refresh();
      return;
    }
    setOpen(false);
  }

  const dialogPrintCss =
    tab === "invoice" && paperSize === "a6"
      ? "@page { size: A6 portrait; margin: 3.5mm; }"
      : tab === "invoice" && paperSize === "80mm"
        ? "@page { size: 80mm auto; margin: 2.5mm; }"
        : "@page { size: A4 portrait; margin: 8mm; }";

  return (
    <>
      {open ? <style media="print">{dialogPrintCss}</style> : null}
      {triggerVariant === "link" ? (
        <button
          type="button"
          onClick={handleOpen}
          className={cn(
            "mono link inline-flex min-h-[40px] cursor-pointer items-center text-left max-[767px]:break-all min-[768px]:whitespace-nowrap text-[12px] min-[1280px]:text-[13px] tracking-tight bg-transparent border-0 p-0",
            className,
          )}
        >
          {label ?? row.externalId}
        </button>
      ) : (
        <Button
          type="button"
          variant={
            triggerVariant === "ghost"
              ? "ghost"
              : triggerVariant === "outline"
                ? "outline"
                : "secondary"
          }
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
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-[min(95vw,1160px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(95vw,1160px)]">
          <DialogHeader className="no-print border-b border-border bg-[#f8fafc] px-4 py-3.5 pr-14 text-left sm:px-6 sm:py-4 sm:pr-14">
            <div className="flex flex-col gap-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-extrabold text-foreground sm:text-lg">
                <span>คำสั่งซื้อ #{row.externalId}</span>
                {row.orderCode && row.orderCode !== row.externalId ? (
                  <Badge variant="neutral" size="sm" className="mono">
                    ผูกออเดอร์ #{row.orderCode}
                  </Badge>
                ) : (
                  <span className="text-xs font-normal text-muted-foreground">
                    (ยังไม่ผูก #ออเดอร์ใน shipnity)
                  </span>
                )}
                <Badge variant="default" size="sm">
                  TikTok
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
                สลับดูรายละเอียดบิล ใบกำกับภาษีอย่างย่อ หรือใบกำกับภาษีแบบเต็มรูป พร้อมรายการสินค้าที่แมปได้
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-border bg-white px-4 py-2.5 sm:px-6">
            <div
              role="tablist"
              aria-label="เลือกประเภทเอกสาร"
              className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1"
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
                    : "text-[#334155] hover:bg-white hover:text-[#0f172a]"
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
                    : "text-[#334155] hover:bg-white hover:text-[#0f172a]"
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
                    : "text-[#334155] hover:bg-white hover:text-[#0f172a]"
                }
              >
                <IconReceipt size={15} /> ใบกำกับฯ (แบบเต็มรูป)
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {row.paidDate ? (
                <Button asChild variant="outline" size="xs">
                  <Link
                    href={`/days/${row.paidDate}`}
                    onClick={() => setOpen(false)}
                  >
                    <IconCalendar size={14} /> ดูรอบชำระ
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                variant="default"
                size="xs"
                disabled={navigatingPrint}
              >
                <Link href={fullPageHref} onClick={handleOpenFullPage}>
                  {navigatingPrint ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <IconPrinter size={14} />
                  )}
                  เปิดหน้าพิมพ์ / PDF
                </Link>
              </Button>
            </div>
          </div>

          {tab === "invoice" ? (
            <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[#f8fafc] px-4 py-2 sm:px-6">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-[#334155]">
                  ขนาดกระดาษพิมพ์:
                </span>
                {[
                  {
                    key: "a6" as InvoicePaperSize,
                    label: "100×150 มม. (A6)",
                  },
                  {
                    key: "80mm" as InvoicePaperSize,
                    label: "สลิป 80 มม.",
                  },
                  {
                    key: "a4" as InvoicePaperSize,
                    label: "A4 เต็มแผ่น",
                  },
                ].map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    variant={paperSize === opt.key ? "default" : "outline"}
                    size="xs"
                    onClick={() => setPaperSize(opt.key)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              {paperSize === "a6" ||
              paperSize === "a4-4up" ||
              paperSize === "80mm" ? (
                <InvoiceZoomControl compact />
              ) : null}
            </div>
          ) : null}

          {tab === "invoice_full" ? (
            <div className="no-print border-b border-border bg-[#f8fafc] px-4 py-2.5 sm:px-6">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#475569]">
                    ชื่อผู้ซื้อ / บริษัท
                  </label>
                  <Input
                    value={buyerName}
                    onChange={(e) => {
                      setBuyerName(e.target.value);
                      setSaveState("idle");
                    }}
                    placeholder="ชื่อลูกค้า / บริษัท"
                    className="h-8 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#475569]">
                    เลขผู้เสียภาษีผู้ซื้อ (ถ้ามี)
                  </label>
                  <Input
                    value={buyerTaxId}
                    onChange={(e) => {
                      setBuyerTaxId(e.target.value);
                      setSaveState("idle");
                    }}
                    placeholder="เช่น 01055XXXXXXXX (13 หลัก)"
                    className="h-8 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#475569]">
                    ที่อยู่ผู้ซื้อ
                  </label>
                  <Input
                    value={buyerAddress}
                    onChange={(e) => {
                      setBuyerAddress(e.target.value);
                      setSaveState("idle");
                    }}
                    placeholder="ที่อยู่สำหรับออกใบกำกับภาษีเต็มรูป"
                    className="h-8 bg-white text-xs"
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#475569]">
                  {saveState === "saving" ? (
                    <>
                      <Loader2Icon className="size-3.5 animate-spin text-[#2563eb]" />
                      <span className="text-[#2563eb]">
                        กำลังบันทึกข้อมูลผู้ซื้อ...
                      </span>
                    </>
                  ) : saveState === "saved" || (!isDirty && (persistedBuyer.name || persistedBuyer.taxId || persistedBuyer.address)) ? (
                    <>
                      <CheckIcon className="size-3.5 text-[#059669]" />
                      <span className="font-semibold text-[#059669]">
                        บันทึกข้อมูลผู้ซื้อลงระบบแล้ว (พร้อมพิมพ์)
                      </span>
                    </>
                  ) : saveState === "error" ? (
                    <span className="font-semibold text-[#dc2626]">
                      บันทึกไม่สำเร็จ กรุณากดปุ่มบันทึกอีกครั้ง
                    </span>
                  ) : (
                    <span>
                      ระบบบันทึกข้อมูลผู้ซื้ออัตโนมัติและส่งต่อไปยังหน้าพิมพ์
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant={isDirty ? "default" : "outline"}
                  size="xs"
                  disabled={saveState === "saving"}
                  onClick={() => void saveBuyerToDb()}
                >
                  {saveState === "saving" ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <SaveIcon className="size-3.5" />
                  )}
                  บันทึกข้อมูลผู้ซื้อ
                </Button>
              </div>
            </div>
          ) : null}

          <div
            data-invoice-scroll-container
            className="min-h-0 flex-1 overflow-y-auto bg-[#f1f5f9] p-3 sm:p-5"
          >
            {tab === "bill" ? (
              <BillDocument
                bill={bill}
                invoiceNo={row.invoiceNo}
                channel={row.channel}
                orderCode={row.orderCode}
                customerName={buyerName || row.customerName}
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
                paperSize={tab === "invoice" ? paperSize : "a4"}
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
