"use client";

import React from "react";
import {
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  PrinterIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExpenseRecord } from "@/lib/expenses";
import { formatTHB } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: "โอนเงินผ่านธนาคาร",
  cash: "เงินสด",
  credit_card: "บัตรเครดิตบริษัท",
  platform_deduct: "หักจากยอดโอนแพลตฟอร์ม",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "ชำระเงินแล้ว",
  pending: "รอชำระ (เตรียมจ่ายเงิน)",
  void: "ยกเลิกเอกสาร",
};

const VAT_TYPE_LABELS: Record<string, string> = {
  none: "ไม่มีภาษีมูลค่าเพิ่ม (0%)",
  exclude: "แยกภาษีมูลค่าเพิ่ม 7%",
  include: "รวมภาษีมูลค่าเพิ่ม 7%",
};

export function formatThaiDateDMY(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

interface ReceiptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: ExpenseRecord | null;
  onOpenVoucher?: (rec: ExpenseRecord) => void;
  onEditRecord?: (rec: ExpenseRecord) => void;
}

export function ExpenseReceiptPreviewDialog({
  open,
  onOpenChange,
  record,
  onOpenVoucher,
  onEditRecord,
}: ReceiptPreviewDialogProps) {
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-w-[calc(100%-1.5rem)] w-full max-h-[90dvh] overflow-y-auto bg-white border border-slate-200 shadow-2xl">
        <DialogHeader className="pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="font-mono text-xs font-bold bg-emerald-50 text-emerald-800 border-emerald-200"
            >
              {record.documentNo}
            </Badge>
            <span className="text-xs font-semibold text-slate-500">
              วันที่ {formatThaiDateDMY(record.entryDate)}
            </span>
          </div>
          <DialogTitle className="text-slate-900 font-bold text-base">
            หลักฐานใบเสร็จ / บิลค่าใช้จ่าย ·{" "}
            {record.vendorName || record.title}
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            หมวดหมู่:{" "}
            {record.categoryAccountCode
              ? `${record.categoryAccountCode} / ${record.categoryName}`
              : record.categoryName}{" "}
            · ยอดรวมสุทธิ {formatTHB(record.amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-1">
          {/* Financial Breakdown Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl border border-slate-200 bg-[#f8fafc] p-3 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-slate-500">ยอดก่อนภาษี</span>
              <span className="font-mono font-bold text-slate-800">
                {formatTHB(record.subtotalAmount)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-slate-500">
                ภาษีซื้อ 7%
              </span>
              <span className="font-mono font-bold text-sky-700">
                {record.vatAmount > 0 ? formatTHB(record.vatAmount) : "฿0.00"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-slate-500">
                หัก ณ ที่จ่าย ({record.whtRate}%)
              </span>
              <span className="font-mono font-bold text-amber-700">
                {record.whtAmount > 0
                  ? `-${formatTHB(record.whtAmount)}`
                  : "฿0.00"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold text-slate-700">
                ยอดจ่ายสุทธิจริง
              </span>
              <span className="font-mono font-black text-rose-600">
                {formatTHB(record.netPaidAmount)}
              </span>
            </div>
          </div>

          {/* Image / Attachment Preview Area */}
          {record.attachmentUrl ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-900/5 p-3">
              <div className="max-h-[440px] w-full overflow-auto rounded-lg bg-white p-2 flex items-center justify-center border border-slate-200/80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={record.attachmentUrl}
                  alt={record.attachmentName || record.documentNo}
                  className="max-h-[410px] w-auto max-w-full object-contain rounded"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 w-full text-xs text-slate-600 px-1">
                <span className="truncate max-w-[260px] font-medium">
                  📎 {record.attachmentName || `${record.documentNo}.jpg`}
                </span>
                <a
                  href={record.attachmentUrl}
                  download={
                    record.attachmentName || `${record.documentNo}-receipt.jpg`
                  }
                  className="inline-flex items-center gap-1.5 font-bold text-[#fe2c55] hover:underline"
                >
                  <DownloadIcon className="size-3.5" />
                  ดาวน์โหลดรูปใบเสร็จ
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-slate-300 bg-[#f8fafc] p-8 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-slate-200/70 text-slate-500">
                <ImageIcon className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-bold text-slate-700">
                  ยังไม่ได้แนบรูปใบเสร็จ / สลิปโอนเงินในบิลนี้
                </p>
                <p className="text-[11px] text-slate-500">
                  คุณสามารถกดปุ่ม &ldquo;แก้ไขบิล / แนบรูป&rdquo; ด้านล่างเพื่ออัปโหลดรูปหลักฐานเพิ่มเติมได้ทันที
                </p>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
            {onEditRecord && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8.5 px-3 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onOpenChange(false);
                  onEditRecord(record);
                }}
              >
                แก้ไขบิล / แนบรูป
              </Button>
            )}
            {onOpenVoucher && (
              <Button
                type="button"
                size="sm"
                className="h-8.5 gap-1.5 px-3.5 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white"
                onClick={() => {
                  onOpenChange(false);
                  onOpenVoucher(record);
                }}
              >
                <PrinterIcon className="size-3.5" />
                ดู / พิมพ์ใบสำคัญจ่าย
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ExpenseVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: ExpenseRecord | null;
  seller?: {
    name?: string;
    taxId?: string;
    address?: string;
    phone?: string;
  };
}

export function ExpenseVoucherDialog({
  open,
  onOpenChange,
  record,
  seller,
}: ExpenseVoucherDialogProps) {
  if (!record) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[840px] max-w-[calc(100%-1.5rem)] w-full max-h-[92dvh] overflow-y-auto p-0 bg-white border border-slate-200 shadow-2xl print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="sr-only">
            <DialogTitle>ใบสำคัญจ่าย {record.documentNo}</DialogTitle>
            <DialogDescription>
              พรีวิวใบสำคัญจ่ายสำหรับพิมพ์แนบเอกสารทางบัญชี
            </DialogDescription>
          </DialogHeader>

          {/* Top Bar (Hidden on print) */}
          <div className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#f8fafc] px-5 py-3 pr-14 shadow-2xs">
            <div className="flex items-center gap-2">
              <FileTextIcon className="size-4 text-[#fe2c55]" />
              <span className="text-sm font-bold text-slate-800">
                ใบสำคัญจ่าย · {record.documentNo}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => onOpenChange(false)}
              >
                ปิดหน้าต่าง
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-xs"
                onClick={() => window.print()}
              >
                <PrinterIcon className="size-3.5" />
                สั่งพิมพ์ใบสำคัญจ่าย
              </Button>
            </div>
          </div>

          {/* Printable Payment Voucher Document (No truncation on print!) */}
          <div className="expense-voucher-print p-6 sm:p-8 text-slate-900 bg-white print:p-0 print:m-0 print:max-w-none">
            {/* Company & Document Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between border-b-2 border-slate-800 pb-4 gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-black text-slate-900">
                  {seller?.name || "บริษัท ดราก้อน 19 จำกัด"}
                </h1>
                {seller?.taxId && (
                  <p className="text-xs text-slate-600">
                    เลขประจำตัวผู้เสียภาษี:{" "}
                    <span className="font-mono font-bold text-slate-900">
                      {seller.taxId}
                    </span>
                  </p>
                )}
                {seller?.address && (
                  <p className="text-xs text-slate-600 max-w-md leading-relaxed">
                    {seller.address}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:items-end gap-1">
                <div className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                  ใบสำคัญจ่าย
                </div>
                <p className="text-xs font-bold text-slate-900 mt-1">
                  เลขที่เอกสาร:{" "}
                  <span className="font-mono">{record.documentNo}</span>
                </p>
                <p className="text-xs text-slate-600">
                  วันที่เอกสาร:{" "}
                  <span className="font-mono font-semibold text-slate-900">
                    {formatThaiDateDMY(record.entryDate)}
                  </span>
                </p>
                <p className="text-xs text-slate-600">
                  สถานะ:{" "}
                  <span className="font-bold text-slate-900">
                    {PAYMENT_STATUS_LABELS[record.paymentStatus] ||
                      record.paymentStatus}
                  </span>
                </p>
              </div>
            </div>

            {/* Payee / Vendor Information Box */}
            <div className="my-4 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-300 bg-[#f8fafc] p-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <div>
                  <span className="text-slate-500">จ่ายให้แก่ (ผู้จำหน่าย/ผู้รับเงิน): </span>
                  <strong className="text-slate-900">
                    {record.vendorName || "-"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">เลขผู้เสียภาษีผู้ขาย: </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {record.vendorTaxId || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">อ้างอิงเลขที่ใบกำกับภาษีซื้อ/ใบเสร็จ: </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {record.taxInvoiceNo || "-"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div>
                  <span className="text-slate-500">รผังบัญชี / หมวดหมู่: </span>
                  <strong className="text-slate-900">
                    {record.categoryAccountCode
                      ? `${record.categoryAccountCode} / ${record.categoryName}`
                      : record.categoryName}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">ช่องทางการชำระเงิน: </span>
                  <span className="font-semibold text-slate-800">
                    {PAYMENT_METHOD_LABELS[record.paymentMethod] ||
                      record.paymentMethod}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">ประเภทภาษี: </span>
                  <span className="font-semibold text-slate-800">
                    {VAT_TYPE_LABELS[record.vatType] || record.vatType}
                  </span>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full border-collapse border border-slate-300 text-xs mb-4">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold">
                  <th className="border border-slate-300 p-2 text-center w-12">
                    ลำดับ
                  </th>
                  <th className="border border-slate-300 p-2 text-left w-36">
                    รหัสบัญชี
                  </th>
                  <th className="border border-slate-300 p-2 text-left">
                    รายการ / รายละเอียดค่าใช้จ่าย
                  </th>
                  <th className="border border-slate-300 p-2 text-right w-36">
                    จำนวนเงินก่อนภาษี
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 p-2.5 text-center font-mono">
                    1
                  </td>
                  <td className="border border-slate-300 p-2.5 font-mono font-semibold text-slate-800">
                    {record.categoryAccountCode || "-"}
                  </td>
                  <td className="border border-slate-300 p-2.5">
                    <div className="font-bold text-slate-900">{record.title}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      หมวดหมู่: {record.categoryName}
                      {record.note ? ` · หมายเหตุ: ${record.note}` : ""}
                    </div>
                  </td>
                  <td className="border border-slate-300 p-2.5 text-right font-mono font-bold text-slate-900">
                    {formatTHB(record.subtotalAmount)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td
                    colSpan={3}
                    className="border border-slate-300 p-2 text-right font-semibold text-slate-700"
                  >
                    รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม
                  </td>
                  <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                    {formatTHB(record.subtotalAmount)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={3}
                    className="border border-slate-300 p-2 text-right font-semibold text-slate-700"
                  >
                    ภาษีมูลค่าเพิ่ม / ภาษีซื้อ 7%
                  </td>
                  <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                    {formatTHB(record.vatAmount)}
                  </td>
                </tr>
                <tr className="bg-slate-50">
                  <td
                    colSpan={3}
                    className="border border-slate-300 p-2 text-right font-bold text-slate-900"
                  >
                    ยอดรวมทั้งสิ้น
                  </td>
                  <td className="border border-slate-300 p-2 text-right font-mono font-extrabold text-slate-900">
                    {formatTHB(record.amount)}
                  </td>
                </tr>
                {record.whtAmount > 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="border border-slate-300 p-2 text-right font-semibold text-amber-800"
                    >
                      หักภาษี ณ ที่จ่าย {record.whtRate}%
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono font-bold text-amber-800">
                      -{formatTHB(record.whtAmount)}
                    </td>
                  </tr>
                )}
                <tr className="bg-rose-50/70">
                  <td
                    colSpan={3}
                    className="border border-slate-300 p-2.5 text-right font-black text-rose-950"
                  >
                    ยอดชำระเงินสุทธิจริง
                  </td>
                  <td
                    className={cn(
                      "border border-slate-300 p-2.5 text-right font-mono text-sm font-black text-rose-700",
                    )}
                  >
                    {formatTHB(record.netPaidAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Optional Attached Receipt Thumbnail on Print */}
            {record.attachmentUrl && (
              <div className="mb-6 rounded-lg border border-slate-300 p-3 break-inside-avoid">
                <p className="text-[11px] font-bold text-slate-700 mb-2">
                  หลักฐานใบเสร็จรับเงิน / สลิปแนบท้ายเอกสาร:
                </p>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.attachmentUrl}
                    alt={record.documentNo}
                    className="max-h-[240px] w-auto object-contain rounded border border-slate-200"
                  />
                </div>
              </div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-6 pt-6 text-center text-xs break-inside-avoid">
              <div className="flex flex-col items-center gap-7">
                <span>ลงชื่อ ....................................................</span>
                <div className="flex flex-col gap-0.5 text-slate-600">
                  <span className="font-bold text-slate-800">
                    ( .................................................... )
                  </span>
                  <span>ผู้จัดทำ / ผู้เบิกจ่าย</span>
                  <span>วันที่ ...... / ...... / ..........</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-7">
                <span>ลงชื่อ ....................................................</span>
                <div className="flex flex-col gap-0.5 text-slate-600">
                  <span className="font-bold text-slate-800">
                    ( .................................................... )
                  </span>
                  <span>ฝ่ายบัญชี / ผู้ตรวจสอบ</span>
                  <span>วันที่ ...... / ...... / ..........</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-7">
                <span>ลงชื่อ ....................................................</span>
                <div className="flex flex-col gap-0.5 text-slate-600">
                  <span className="font-bold text-slate-800">
                    ( .................................................... )
                  </span>
                  <span>ผู้อนุมัติจ่ายเงิน</span>
                  <span>วันที่ ...... / ...... / ..........</span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {open && (
        <style media="print">{`
          @page { size: A4 portrait; margin: 10mm 12mm; }
          body:has([role="dialog"]) .app-shell,
          body:has([role="dialog"]) [data-slot="dialog-overlay"],
          [role="dialog"] [data-slot="dialog-header"],
          [role="dialog"] [data-slot="dialog-close"],
          .no-print {
            display: none !important;
          }
          [role="dialog"][data-slot="dialog-content"] {
            position: static !important;
            inset: auto !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            transform: none !important;
            translate: none !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .expense-voucher-print {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            translate: none !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
        `}</style>
      )}
    </>
  );
}
