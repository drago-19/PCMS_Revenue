"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { TableRow } from "@/components/ui/table";
import { buildBill } from "@/lib/bill";
import { buildInvoice, isOrderEligibleForInvoice } from "@/lib/invoice";
import type { TransactionRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

type PreviewTab = "bill" | "invoice" | "invoice_full";

interface BillPreviewContextType {
  openPreview: (row: TransactionRow, defaultTab?: PreviewTab) => void;
}

const BillPreviewContext = createContext<BillPreviewContextType | null>(null);

export function useBillPreview() {
  return useContext(BillPreviewContext);
}

export function BillPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeRow, setActiveRow] = useState<TransactionRow | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("bill");

  const openPreview = useCallback(
    (row: TransactionRow, defaultTab: PreviewTab = "bill") => {
      setActiveRow(row);
      setTab(defaultTab);
      setOpen(true);
    },
    [],
  );

  return (
    <BillPreviewContext.Provider value={{ openPreview }}>
      {children}
      {activeRow ? (
        <BillPreviewModal
          key={activeRow.id}
          row={activeRow}
          open={open}
          onOpenChange={setOpen}
          initialTab={tab}
        />
      ) : null}
    </BillPreviewContext.Provider>
  );
}

export function BillTableRow({
  row,
  className,
  children,
}: {
  row: TransactionRow;
  className?: string;
  children: React.ReactNode;
}) {
  const previewCtx = useBillPreview();

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as HTMLElement | null;
    if (
      target?.closest("button") ||
      target?.closest("a") ||
      target?.closest("input") ||
      target?.closest(".copy-btn") ||
      target?.closest(".no-row-click")
    ) {
      return;
    }
    if (previewCtx) {
      previewCtx.openPreview(row, "bill");
    }
  };

  return (
    <TableRow
      onClick={handleRowClick}
      className={cn(
        "cursor-pointer transition-none hover:bg-transparent min-[768px]:[&>td]:align-top",
        className,
      )}
    >
      {children}
    </TableRow>
  );
}

export function BillPreviewTrigger({
  row,
  defaultTab = "bill",
  triggerVariant = "button",
  label,
  className,
  children,
}: {
  row: TransactionRow;
  defaultTab?: PreviewTab;
  triggerVariant?: "button" | "ghost" | "outline" | "link";
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const previewCtx = useBillPreview();
  const [localOpen, setLocalOpen] = useState(false);

  function handleOpen(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (previewCtx) {
      previewCtx.openPreview(row, defaultTab);
      return;
    }
    setLocalOpen(true);
  }

  const displayOrderId = row.externalId.includes("|")
    ? row.orderCode || row.externalId.split("|")[0] || row.externalId
    : row.externalId;

  return (
    <>
      {children ? (
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleOpen();
            }
          }}
          className={className}
        >
          {children}
        </div>
      ) : triggerVariant === "link" ? (
        <button
          type="button"
          onClick={handleOpen}
          className={cn(
            "mono link inline-flex min-h-[40px] min-[768px]:min-h-[26px] cursor-pointer items-center text-left max-[767px]:break-all min-[768px]:whitespace-nowrap text-[12.5px] min-[1280px]:text-[13px] tracking-tight bg-transparent border-0 p-0",
            className,
          )}
        >
          {label ?? displayOrderId}
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

      {!previewCtx ? (
        <BillPreviewModal
          row={row}
          open={localOpen}
          onOpenChange={setLocalOpen}
          initialTab={defaultTab}
        />
      ) : null}
    </>
  );
}

export function BillPreviewModal({
  row,
  open,
  onOpenChange,
  initialTab = "bill",
}: {
  row: TransactionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: PreviewTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<PreviewTab>(initialTab);
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
  const enableFullTaxInvoice =
    row.sellerSettings?.enableFullTaxInvoice === true;
  const isInvoiceEligible = isOrderEligibleForInvoice(row);

  useEffect(() => {
    if (open) {
      const resolvedDefault =
        initialTab === "invoice_full" && !enableFullTaxInvoice
          ? "invoice"
          : initialTab;
      setTab(!isInvoiceEligible ? "bill" : resolvedDefault);
      setBuyerName(persistedBuyer.name);
      setBuyerTaxId(persistedBuyer.taxId);
      setBuyerAddress(persistedBuyer.address);
      setSaveState("idle");
    }
  }, [open, initialTab, isInvoiceEligible, enableFullTaxInvoice, persistedBuyer]);

  const effectiveTab: PreviewTab =
    !isInvoiceEligible
      ? "bill"
      : tab === "invoice_full" && !enableFullTaxInvoice
        ? "invoice"
        : tab;
  const invoiceMode: InvoiceMode =
    effectiveTab === "invoice_full" ? "full" : "abbreviated";

  const encodedExtId = encodeURIComponent(row.externalId);
  const displayOrderId = row.externalId.includes("|")
    ? row.orderCode || row.externalId.split("|")[0] || row.externalId
    : row.externalId;

  const fullPageHref =
    isInvoiceEligible && effectiveTab === "invoice"
      ? paperSize === "a6"
        ? `/invoices/${encodedExtId}`
        : `/invoices/${encodedExtId}?paper=${paperSize}`
      : isInvoiceEligible && effectiveTab === "invoice_full"
        ? `/invoices/${encodedExtId}?mode=full`
        : `/bills/${encodedExtId}`;

  async function handleOpenFullPage(e: React.MouseEvent<HTMLAnchorElement>) {
    if (effectiveTab === "invoice_full") {
      e.preventDefault();
      setNavigatingPrint(true);
      await saveBuyerToDb({
        name: latestInputsRef.current.name,
        taxId: latestInputsRef.current.taxId,
        address: latestInputsRef.current.address,
      });
      setNavigatingPrint(false);
      onOpenChange(false);
      router.push(fullPageHref);
      router.refresh();
      return;
    }
    onOpenChange(false);
  }

  const dialogPrintCss =
    effectiveTab === "invoice" && paperSize === "a6"
      ? "@page { size: A6 portrait; margin: 3.5mm; }"
      : effectiveTab === "invoice" && paperSize === "80mm"
        ? "@page { size: 80mm auto; margin: 2.5mm; }"
        : "@page { size: A4 portrait; margin: 8mm; }";

  return (
    <>
      {open ? <style media="print">{dialogPrintCss}</style> : null}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[90dvh] max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-[min(95vw,1160px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(95vw,1160px)]">
          <DialogHeader className="no-print shrink-0 border-b border-border bg-[#f8fafc] px-4 py-3.5 pr-14 text-left sm:px-6 sm:py-4 sm:pr-14">
            <div className="flex flex-col gap-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-extrabold text-foreground sm:text-lg">
                <span>คำสั่งซื้อ #{displayOrderId}</span>
                {row.orderCode && row.orderCode !== displayOrderId ? (
                  <Badge variant="neutral" size="sm" className="mono">
                    ผูกออเดอร์ #{row.orderCode}
                  </Badge>
                ) : !row.orderCode ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    (ยังไม่ผูก #ออเดอร์ใน shipnity)
                  </span>
                ) : null}
                <Badge
                  variant={
                    row.channel === "Shopee"
                      ? "shopee"
                      : row.channel === "Facebook"
                        ? "facebook"
                        : "default"
                  }
                  size="sm"
                >
                  {row.channel === "Shopee"
                    ? "Shopee"
                    : row.channel === "Facebook"
                      ? "Facebook"
                      : "TikTok"}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
                {enableFullTaxInvoice
                  ? "สลับดูรายละเอียดบิล ใบกำกับภาษีอย่างย่อ หรือใบกำกับภาษีแบบเต็มรูป พร้อมรายการสินค้าที่แมปได้"
                  : "สลับดูรายละเอียดบิล หรือใบกำกับภาษีอย่างย่อ พร้อมรายการสินค้าที่แมปได้"}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="no-print shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-white px-4 py-2 sm:px-6 sm:py-2.5">
            <div
              role="tablist"
              aria-label="เลือกประเภทเอกสาร"
              className="flex w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1 sm:inline-flex sm:w-auto"
            >
              <Button
                type="button"
                role="tab"
                aria-selected={effectiveTab === "bill"}
                variant={effectiveTab === "bill" ? "default" : "ghost"}
                size="xs"
                onClick={() => setTab("bill")}
                className={
                  effectiveTab === "bill"
                    ? "flex-1 justify-center shadow-xs sm:flex-initial"
                    : "flex-1 justify-center text-[#334155] hover:bg-white hover:text-[#0f172a] sm:flex-initial"
                }
              >
                <IconFile size={15} /> รายละเอียดบิล
              </Button>
              {isInvoiceEligible ? (
                <>
                  <Button
                    type="button"
                    role="tab"
                    aria-selected={effectiveTab === "invoice"}
                    variant={effectiveTab === "invoice" ? "default" : "ghost"}
                    size="xs"
                    onClick={() => setTab("invoice")}
                    className={
                      effectiveTab === "invoice"
                        ? "flex-1 justify-center shadow-xs sm:flex-initial"
                        : "flex-1 justify-center text-[#334155] hover:bg-white hover:text-[#0f172a] sm:flex-initial"
                    }
                  >
                    <IconReceipt size={15} /> ใบกำกับฯ (อย่างย่อ)
                  </Button>
                  {enableFullTaxInvoice ? (
                    <Button
                      type="button"
                      role="tab"
                      aria-selected={effectiveTab === "invoice_full"}
                      variant={
                        effectiveTab === "invoice_full" ? "default" : "ghost"
                      }
                      size="xs"
                      onClick={() => setTab("invoice_full")}
                      className={
                        effectiveTab === "invoice_full"
                          ? "flex-1 justify-center shadow-xs sm:flex-initial"
                          : "flex-1 justify-center text-[#334155] hover:bg-white hover:text-[#0f172a] sm:flex-initial"
                      }
                    >
                      <IconReceipt size={15} /> ใบกำกับฯ (แบบเต็มรูป)
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {row.paidDate ? (
                <Button asChild variant="outline" size="xs" className="flex-1 sm:flex-initial">
                  <Link
                    href={`/bills?date=${encodeURIComponent(row.paidDate)}`}
                    onClick={() => onOpenChange(false)}
                  >
                    <IconCalendar size={14} /> ดูบิลรอบนี้
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                variant="default"
                size="xs"
                disabled={navigatingPrint}
                aria-busy={navigatingPrint || undefined}
                className="flex-1 sm:flex-initial"
              >
                <Link href={fullPageHref} onClick={handleOpenFullPage}>
                  {navigatingPrint ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <IconPrinter size={14} />
                  )}
                  {effectiveTab === "bill" ? "พิมพ์บิลคำสั่งซื้อ / PDF" : "เปิดหน้าพิมพ์ / PDF"}
                </Link>
              </Button>
            </div>
          </div>

          {effectiveTab === "bill" || effectiveTab === "invoice" ? (
            <div className="no-print shrink-0 flex min-h-[54px] flex-wrap items-center justify-between gap-2 border-b border-border bg-[#f8fafc] px-4 py-1.5 sm:px-6">
              {effectiveTab === "invoice" ? (
                <>
                  <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                    <span className="text-xs font-bold text-[#334155]">
                      ขนาดกระดาษพิมพ์:
                    </span>
                    <div className="flex w-full flex-wrap items-center gap-1 sm:inline-flex sm:w-auto sm:gap-1.5">
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
                          className="flex-1 justify-center px-2 sm:flex-initial sm:px-2.5"
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex min-h-[28px] items-center">
                    {paperSize === "a6" ||
                    paperSize === "a4-4up" ||
                    paperSize === "80mm" ? (
                      <InvoiceZoomControl compact />
                    ) : (
                      <span className="hidden text-xs font-medium text-[#64748b] sm:inline">
                        ขนาดมาตรฐาน A4 (210×297 มม.)
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex min-h-[28px] flex-wrap items-center gap-2 text-xs text-[#475569]">
                    <span className="font-bold text-[#334155]">
                      เอกสารสรุปรายละเอียดบิลคำสั่งซื้อ
                    </span>
                    {row.importFilename ? (
                      <span className="truncate max-w-[260px] sm:max-w-[420px] text-[#64748b]">
                        · ไฟล์ต้นทาง: {row.importFilename}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-[28px] items-center">
                    {row.invoiceNo ? (
                      <span className="mono text-xs font-bold text-[#0f172a]">
                        เลขที่ใบกำกับฯ: {row.invoiceNo}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {effectiveTab === "invoice_full" ? (
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
                  loading={saveState === "saving"}
                  onClick={() => void saveBuyerToDb()}
                >
                  {saveState === "saving" ? null : (
                    <SaveIcon className="size-3.5" />
                  )}
                  บันทึกข้อมูลผู้ซื้อ
                </Button>
              </div>
            </div>
          ) : null}

          <div
            data-invoice-scroll-container
            className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-[#f1f5f9] p-3 sm:p-5"
          >
            {effectiveTab === "bill" ? (
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
                omsNote={row.omsNote}
                isNoProductPriceOrder={row.isNoProductPriceOrder}
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
                paperSize={effectiveTab === "invoice" ? paperSize : "a4"}
                buyerOverride={
                  effectiveTab === "invoice_full"
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
