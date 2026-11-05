"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  CalendarIcon,
  CheckIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateExpenseTaxAmounts,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
  type ExpenseRecord,
  type ExpenseVatType,
} from "@/lib/expense-math";
import { formatThaiDate, formatTHB } from "@/lib/format";

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!file.type.startsWith("image/")) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const maxDim = 1280;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export interface ExpenseRecordFormValues {
  id?: number;
  entryDate: string;
  categoryId: number;
  newCategoryName?: string;
  newCategoryAccountCode?: string;
  amount: string;
  vendorName: string;
  vendorTaxId: string;
  taxInvoiceNo: string;
  title: string;
  note: string;
  vatType: ExpenseVatType;
  whtRate: string;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod: ExpensePaymentMethod;
  attachmentUrl: string | null;
  attachmentName: string | null;
}

interface ExpenseRecordFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  editingRecord: ExpenseRecord | null;
  initialValues: ExpenseRecordFormValues;
  saving: boolean;
  onSubmit: (values: ExpenseRecordFormValues) => Promise<void>;
  onQuickCreateCategory?: (
    name: string,
    accountCode: string,
  ) => Promise<ExpenseCategory | null>;
}

export function ExpenseRecordFormDialog({
  open,
  onOpenChange,
  categories,
  editingRecord,
  initialValues,
  saving,
  onSubmit,
  onQuickCreateCategory,
}: ExpenseRecordFormDialogProps) {
  const [form, setForm] = useState<ExpenseRecordFormValues>(initialValues);
  const [compressingImage, setCompressingImage] = useState(false);
  const [creatingInlineCat, setCreatingInlineCat] = useState(false);
  const [inlineCatName, setInlineCatName] = useState("");
  const [inlineCatCode, setInlineCatCode] = useState("");
  const [savingInlineCat, setSavingInlineCat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync form when dialog opens with new initialValues
  React.useEffect(() => {
    if (open) {
      setForm(initialValues);
      setCreatingInlineCat(categories.length === 0);
      setInlineCatName("");
      setInlineCatCode("");
    }
  }, [open, initialValues, categories.length]);

  const liveTax = useMemo(() => {
    const amt = parseFloat(form.amount) || 0;
    const wht = parseFloat(form.whtRate) || 0;
    return calculateExpenseTaxAmounts(amt, form.vatType, wht);
  }, [form.amount, form.vatType, form.whtRate]);

  const handleFilePicked = async (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("ขนาดไฟล์ต้องไม่เกิน 12 MB");
      return;
    }
    setCompressingImage(true);
    try {
      const compressed = await compressImageToDataUrl(file);
      setForm((prev) => ({
        ...prev,
        attachmentUrl: compressed,
        attachmentName: file.name,
      }));
      toast.success(`แนบไฟล์ "${file.name}" เรียบร้อย`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "ไม่สามารถแนบไฟล์รูปภาพได้",
      );
    } finally {
      setCompressingImage(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await handleFilePicked(file);
          return;
        }
      }
    }
  };

  const handleSaveInlineCategory = async () => {
    const name = inlineCatName.trim();
    if (!name) {
      toast.error("กรุณาระบุชื่อหมวดหมู่");
      return;
    }
    if (!onQuickCreateCategory) return;
    setSavingInlineCat(true);
    try {
      const created = await onQuickCreateCategory(name, inlineCatCode.trim());
      if (created) {
        setForm((p) => ({ ...p, categoryId: created.id }));
        setCreatingInlineCat(false);
        setInlineCatName("");
        setInlineCatCode("");
      }
    } finally {
      setSavingInlineCat(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalForm = { ...form };
    // If the user typed an inline category name without clicking the small check button first, create it automatically
    if (
      (creatingInlineCat || categories.length === 0) &&
      inlineCatName.trim() &&
      onQuickCreateCategory
    ) {
      setSavingInlineCat(true);
      try {
        const created = await onQuickCreateCategory(
          inlineCatName.trim(),
          inlineCatCode.trim(),
        );
        if (!created) return;
        finalForm = { ...finalForm, categoryId: created.id };
        setCreatingInlineCat(false);
      } finally {
        setSavingInlineCat(false);
      }
    }
    await onSubmit(finalForm);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPaste={handlePaste}
        className="sm:max-w-[660px] max-w-[calc(100%-1.5rem)] w-full max-h-[92dvh] overflow-y-auto bg-white border border-slate-200 shadow-2xl"
      >
        <DialogHeader className="pr-12">
          <DialogTitle className="text-slate-900 font-bold text-base">
            {editingRecord
              ? `แก้ไขเอกสารค่าใช้จ่าย · ${editingRecord.documentNo}`
              : "สร้างบิลค่าใช้จ่ายใหม่ (ออกเลขเอกสารอัตโนมัติ)"}
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            บันทึกข้อมูลผู้จำหน่าย หมวดหมู่ค่าใช้จ่าย ภาษีซื้อ 7% หัก ณ
            ที่จ่าย และแนบรูปใบเสร็จรับเงิน (รองรับการวางรูปจากคลิปบอร์ดได้ทันที)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="flex flex-col gap-3.5">
          {/* Row 1: Date & Category (with inline Quick Add Category) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-entry-date"
                className="text-xs font-bold text-slate-700"
              >
                วันที่เอกสาร <span className="text-[#fe2c55]">*</span>
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    id="exp-entry-date"
                    type="button"
                    aria-label="เลือกวันที่เอกสารค่าใช้จ่าย"
                    className="flex h-10 min-h-[40px] w-full items-center justify-between gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-2xs transition-[color,box-shadow,border-color] outline-none hover:border-slate-300 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  >
                    <span className="truncate font-mono text-xs font-bold">
                      {formatThaiDate(form.entryDate)}
                    </span>
                    <CalendarIcon className="size-4 shrink-0 text-slate-500" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-3">
                  <Calendar
                    selected={form.entryDate}
                    defaultMonthIso={form.entryDate}
                    showCounts={false}
                    onSelect={(iso) =>
                      setForm((p) => ({ ...p, entryDate: iso }))
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="exp-category"
                  className="text-xs font-bold text-slate-700"
                >
                  หมวดหมู่ค่าใช้จ่าย / รหัสผังบัญชี{" "}
                  <span className="text-[#fe2c55]">*</span>
                </label>
                {categories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCreatingInlineCat((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#fe2c55] hover:underline"
                  >
                    <PlusIcon className="size-3" />
                    {creatingInlineCat
                      ? "เลือกจากหมวดหมู่ที่มี"
                      : "สร้างหมวดหมู่ใหม่ตรงนี้"}
                  </button>
                )}
              </div>

              {creatingInlineCat || categories.length === 0 ? (
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                  <Input
                    type="text"
                    value={inlineCatCode}
                    onChange={(e) => setInlineCatCode(e.target.value)}
                    placeholder="รหัส เช่น 53031"
                    className="h-9 w-full sm:w-[115px] font-mono text-xs border-slate-200 bg-white"
                  />
                  <Input
                    type="text"
                    value={inlineCatName}
                    onChange={(e) => setInlineCatName(e.target.value)}
                    placeholder="พิมพ์ชื่อหมวดหมู่ เช่น ค่าไฟฟ้า, ค่าโฆษณา *"
                    className="h-9 flex-1 text-xs border-slate-200 bg-white"
                    required={categories.length === 0}
                  />
                  {categories.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingInlineCat || !inlineCatName.trim()}
                      onClick={handleSaveInlineCategory}
                      className="h-9 px-3 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shrink-0"
                    >
                      {savingInlineCat ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckIcon className="mr-1 size-3.5" />
                          เพิ่ม
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <Select
                  value={String(form.categoryId || categories[0]?.id || "")}
                  onValueChange={(val) =>
                    setForm((p) => ({ ...p, categoryId: Number(val) }))
                  }
                >
                  <SelectTrigger
                    id="exp-category"
                    className="h-10 min-h-[40px] w-full rounded-[10px] border-slate-200 bg-white px-3 text-xs font-semibold shadow-2xs"
                  >
                    <SelectValue placeholder="เลือกหมวดหมู่บัญชี" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                    {categories.map((cat) => (
                      <SelectItem
                        key={cat.id}
                        value={String(cat.id)}
                        className="text-xs font-medium cursor-pointer"
                      >
                        {cat.accountCode
                          ? `${cat.accountCode} / ${cat.name}`
                          : cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Row 2: Vendor Name, Vendor Tax ID, Tax Invoice No */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200/90 bg-[#f8fafc] p-3">
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label
                htmlFor="exp-vendor-name"
                className="text-xs font-bold text-slate-700"
              >
                ชื่อผู้จำหน่าย / ผู้รับเงิน
              </label>
              <Input
                id="exp-vendor-name"
                type="text"
                value={form.vendorName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vendorName: e.target.value }))
                }
                placeholder="เช่น การไฟฟ้านครหลวง, บจก. คลีน"
                className="h-9 text-xs bg-white border-slate-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-vendor-tax"
                className="text-xs font-bold text-slate-700"
              >
                เลขผู้เสียภาษี 13 หลัก
              </label>
              <Input
                id="exp-vendor-tax"
                type="text"
                value={form.vendorTaxId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vendorTaxId: e.target.value }))
                }
                placeholder="เช่น 0105555123456"
                className="h-9 font-mono text-xs bg-white border-slate-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-tax-invoice"
                className="text-xs font-bold text-slate-700"
              >
                เลขที่ใบกำกับภาษีซื้อ / บิล
              </label>
              <Input
                id="exp-tax-invoice"
                type="text"
                value={form.taxInvoiceNo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, taxInvoiceNo: e.target.value }))
                }
                placeholder="เช่น INV-202611-001"
                className="h-9 font-mono text-xs bg-white border-slate-200"
              />
            </div>
          </div>

          {/* Row 3: Item Description & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-title"
                className="text-xs font-bold text-slate-700"
              >
                รายละเอียดรายการค่าใช้จ่าย{" "}
                <span className="text-[#fe2c55]">*</span>
              </label>
              <Input
                id="exp-title"
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="เช่น ค่าโฆษณา TikTok, ค่าไฟฟ้าประจำเดือน, ค่าเช่าโกดัง"
                className="h-9 text-xs border-slate-200"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-note"
                className="text-xs font-medium text-slate-600"
              >
                หมายเหตุ / ชื่อโปรเจ็ค
              </label>
              <Input
                id="exp-note"
                type="text"
                value={form.note}
                onChange={(e) =>
                  setForm((p) => ({ ...p, note: e.target.value }))
                }
                placeholder="เช่น โอนจากกสิกรไทย, แคมเปญ 11.11"
                className="h-9 text-xs border-slate-200"
              />
            </div>
          </div>

          {/* Row 4: Amount, VAT Type, WHT Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-rose-200/80 bg-rose-50/20 p-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-amount"
                className="text-xs font-bold text-slate-800"
              >
                จำนวนเงินตั้งต้น (บาท) <span className="text-[#fe2c55]">*</span>
              </label>
              <Input
                id="exp-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, amount: e.target.value }))
                }
                placeholder="0.00"
                className="h-10 font-mono text-sm font-bold bg-white border-slate-200"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-vat-type"
                className="text-xs font-bold text-slate-800"
              >
                ภาษีมูลค่าเพิ่ม 7%
              </label>
              <Select
                value={form.vatType}
                onValueChange={(val) =>
                  setForm((p) => ({ ...p, vatType: val as ExpenseVatType }))
                }
              >
                <SelectTrigger
                  id="exp-vat-type"
                  className="h-10 min-h-[40px] w-full rounded-[10px] border-slate-200 bg-white px-3 text-xs font-semibold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                  <SelectItem value="none" className="text-xs">
                    ไม่มีภาษีมูลค่าเพิ่ม (0%)
                  </SelectItem>
                  <SelectItem value="exclude" className="text-xs">
                    แยกนอก (+7%)
                  </SelectItem>
                  <SelectItem value="include" className="text-xs">
                    รวมใน (7%)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-wht-rate"
                className="text-xs font-bold text-slate-800"
              >
                ภาษีหัก ณ ที่จ่าย
              </label>
              <Select
                value={String(form.whtRate || "0")}
                onValueChange={(val) =>
                  setForm((p) => ({ ...p, whtRate: val }))
                }
              >
                <SelectTrigger
                  id="exp-wht-rate"
                  className="h-10 min-h-[40px] w-full rounded-[10px] border-slate-200 bg-white px-3 text-xs font-semibold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                  <SelectItem value="0" className="text-xs">
                    ไม่หัก ณ ที่จ่าย (0%)
                  </SelectItem>
                  <SelectItem value="1" className="text-xs">
                    หัก ณ ที่จ่าย 1% (ค่าขนส่ง)
                  </SelectItem>
                  <SelectItem value="2" className="text-xs">
                    หัก ณ ที่จ่าย 2% (ค่าโฆษณา)
                  </SelectItem>
                  <SelectItem value="3" className="text-xs">
                    หัก ณ ที่จ่าย 3% (ค่าบริการ/จ้างทำของ)
                  </SelectItem>
                  <SelectItem value="5" className="text-xs">
                    หัก ณ ที่จ่าย 5% (ค่าเช่าสถานที่)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Live Calculation Summary Bar */}
            <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2 border-t border-rose-200/60 pt-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-slate-600">
                <span>
                  ก่อนภาษี:{" "}
                  <strong className="font-mono text-slate-800">
                    {formatTHB(liveTax.subtotalAmount)}
                  </strong>
                </span>
                <span>
                  VAT 7%:{" "}
                  <strong className="font-mono text-sky-700">
                    +{formatTHB(liveTax.vatAmount)}
                  </strong>
                </span>
                <span>
                  รวมค่าใช้จ่าย:{" "}
                  <strong className="font-mono text-slate-900">
                    {formatTHB(liveTax.totalAmount)}
                  </strong>
                </span>
                {liveTax.whtAmount > 0 && (
                  <span>
                    หัก ณ ที่จ่าย ({liveTax.whtRate}%):{" "}
                    <strong className="font-mono text-purple-700">
                      -{formatTHB(liveTax.whtAmount)}
                    </strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">ยอดจ่ายสุทธิ:</span>
                <span className="font-mono text-sm font-black text-rose-600">
                  {formatTHB(liveTax.netPaidAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Row 5: Payment Status, Payment Method, Receipt Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-payment-status"
                className="text-xs font-bold text-slate-700"
              >
                สถานะการชำระเงิน
              </label>
              <Select
                value={form.paymentStatus}
                onValueChange={(val) =>
                  setForm((p) => ({
                    ...p,
                    paymentStatus: val as ExpensePaymentStatus,
                  }))
                }
              >
                <SelectTrigger
                  id="exp-payment-status"
                  className="h-9 w-full rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                  <SelectItem
                    value="paid"
                    className="text-xs font-semibold text-emerald-700"
                  >
                    ● ชำระเงินแล้ว
                  </SelectItem>
                  <SelectItem
                    value="pending"
                    className="text-xs font-semibold text-amber-700"
                  >
                    ● เตรียมจ่ายเงิน (รอชำระ)
                  </SelectItem>
                  <SelectItem
                    value="void"
                    className="text-xs font-semibold text-slate-500"
                  >
                    ● ยกเลิกเอกสาร
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="exp-payment-method"
                className="text-xs font-bold text-slate-700"
              >
                ช่องทางการจ่ายเงิน
              </label>
              <Select
                value={form.paymentMethod}
                onValueChange={(val) =>
                  setForm((p) => ({
                    ...p,
                    paymentMethod: val as ExpensePaymentMethod,
                  }))
                }
              >
                <SelectTrigger
                  id="exp-payment-method"
                  className="h-9 w-full rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                  <SelectItem value="transfer" className="text-xs">
                    โอนเงินผ่านธนาคาร / พร้อมเพย์
                  </SelectItem>
                  <SelectItem value="cash" className="text-xs">
                    เงินสดย่อย
                  </SelectItem>
                  <SelectItem value="credit_card" className="text-xs">
                    บัตรเครดิตบริษัท
                  </SelectItem>
                  <SelectItem value="platform_deduct" className="text-xs">
                    หักจากยอดโอนแพลตฟอร์ม
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 6: Receipt / Slip Image Upload */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700">
              รูปใบเสร็จรับเงิน / ใบกำกับภาษี / สลิปโอนเงิน
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFilePicked(e.target.files?.[0])}
            />

            {form.attachmentUrl ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-emerald-300 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.attachmentUrl}
                      alt="ตัวอย่างใบเสร็จ"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-xs font-bold text-emerald-900">
                      {form.attachmentName || "แนบรูปใบเสร็จเรียบร้อยแล้ว"}
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      คลิก &ldquo;เปลี่ยนรูป&rdquo; หรือกด Ctrl+V เพื่อวางรูปใหม่
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-2.5 text-xs bg-white border-slate-200"
                  >
                    เปลี่ยนรูป
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="ลบรูปใบเสร็จ"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        attachmentUrl: null,
                        attachmentName: null,
                      }))
                    }
                    className="size-8 text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={compressingImage}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-[#f8fafc] px-4 py-3.5 text-xs font-semibold text-slate-600 transition-colors hover:border-[#fe2c55] hover:bg-rose-50/30 hover:text-[#fe2c55]"
              >
                {compressingImage ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin text-[#fe2c55]" />
                    <span>กำลังย่อและแนบรูปใบเสร็จ...</span>
                  </>
                ) : (
                  <>
                    <UploadIcon className="size-4 text-[#fe2c55]" />
                    <span>
                      คลิกเพื่อเลือกรูปใบเสร็จ/สลิป หรือกด{" "}
                      <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] border border-slate-200">
                        Ctrl + V
                      </kbd>{" "}
                      เพื่อวางรูปที่แคปหน้าจอ
                    </span>
                    <ImageIcon className="size-4 text-slate-400" />
                  </>
                )}
              </button>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => onOpenChange(false)}
              disabled={saving || savingInlineCat}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              className="h-9 px-5 text-xs font-bold rounded-lg bg-[#fe2c55] hover:bg-[#e0264b] text-white"
              disabled={saving || savingInlineCat || compressingImage}
            >
              {saving || savingInlineCat ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : editingRecord ? (
                "บันทึกการแก้ไขเอกสาร"
              ) : (
                "บันทึกบิลค่าใช้จ่าย"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
