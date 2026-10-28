"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCcwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import {
  InvoiceDocument,
  type InvoiceMode,
  type InvoicePaperSize,
} from "@/components/InvoiceDocument";
import { InvoiceZoomControl } from "@/components/InvoiceZoomControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildInvoice } from "@/lib/invoice";
import type { TransactionRow } from "@/lib/queries";
import {
  DEFAULT_SELLER,
  type DefaultInvoicePaperSize,
  type SellerInfo,
  type VatCalculationBase,
} from "@/lib/seller";

const SAMPLE_TRANSACTION: TransactionRow = {
  id: 1,
  importId: 1,
  externalId: "586694353227777627",
  transactionType: "คำสั่งซื้อ",
  isOrder: true,
  createdDate: "2026-10-20",
  paidDate: "2026-10-26",
  currency: "THB",
  income: 693,
  feeTotal: -184.79,
  adjustment: 0,
  payout: 508.21,
  productDetail: null,
  weightEstimated: null,
  weightCharged: null,
  checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
  warnings: [],
  normalized: {
    externalId: "586694353227777627",
    transactionType: "คำสั่งซื้อ",
    isOrder: true,
    createdAt: "2026-10-20",
    paidAt: "2026-10-26",
    currency: "THB",
    fields: {
      productBeforeDiscount: 1750,
      productAfterDiscount: 693,
      storeDiscount: -1057,
      platformDiscount: -138.6,
      customerPayment: 554.4,
      shippingCustomerFee: 0,
      shippingPlatformDiscount: 55,
      feeTotal: -184.79,
      payout: 508.21,
    },
    mappedFields: [],
    feeGroups: {},
    unknownValues: [],
    checks: { incomeDiff: 0, feeDiff: 0, payoutDiff: 0 },
    warnings: [],
    raw: {},
    sourceRows: 1,
    firstRow: 1,
    rowIndexes: [1],
  },
  createdAt: "2026-10-26T00:00:00Z",
  invoiceNo: "TT2610/00422",
  channel: "TikTok",
  orderCode: "DI27",
  customerName: "พ***นทร์ อ***ศรี",
  customerPhone: "089-xxx-xxxx",
  customerAddress: "พระนครศรีอยุธยา",
  province: "พระนครศรีอยุธยา",
  postalCode: "13000",
  courier: "J&T Express",
  trackingNo: "JTTH207764060615",
  omsItems: [
    {
      skuCode: "A56-PK-2XL",
      productName: "แบมบี้ ชมพู (2XL)",
      unitPrice: 250,
      quantity: 1,
    },
    {
      skuCode: "A56-CP-2XL",
      productName: "แบมบี้ ครีมพีช (2XL)",
      unitPrice: 250,
      quantity: 1,
    },
    {
      skuCode: "A58-OG-2XL",
      productName: "อลิซ เขียวขี้ม้า (2XL)",
      unitPrice: 250,
      quantity: 1,
    },
    {
      skuCode: "A58-TD-2XL",
      productName: "อลิซ เทาท็อปดาย (2XL)",
      unitPrice: 250,
      quantity: 1,
    },
    {
      skuCode: "A58-ML-2XL",
      productName: "อลิซ เขียวเมล่อน (2XL)",
      unitPrice: 250,
      quantity: 1,
    },
    {
      skuCode: "A62-MC-2XL",
      productName: "เลดี้แทรมป์ เขียวมัจฉะ (2XL)",
      unitPrice: 250,
      quantity: 1,
    },
    {
      skuCode: "A62-NV-2XL",
      productName: "เลดี้แทรมป์ กรม (2XL)",
      unitPrice: 250,
      quantity: 1,
    },
  ],
};

const DRAFT_STORAGE_KEY = "pcms_document_settings_draft_v1";

export function DocumentSettingsClient({
  initialSettings,
}: {
  initialSettings: Required<SellerInfo>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const isDirtyRef = useRef(false);
  const [form, setForm] = useState<Required<SellerInfo>>(initialSettings);
  const [vatRateInput, setVatRateInput] = useState<string>(
    String(initialSettings.vatRate),
  );
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<InvoiceMode>("abbreviated");
  const [previewPaper, setPreviewPaper] = useState<InvoicePaperSize>(
    initialSettings.defaultPaperSize ?? "a6",
  );

  function readDomFormOverrides(
    formEl: HTMLFormElement | null,
    base: Required<SellerInfo>,
  ): Required<SellerInfo> {
    if (!formEl) return base;
    const getInputVal = (fieldName: string, fallback: string) => {
      const el = formEl.elements.namedItem(fieldName) as HTMLInputElement | null;
      return el && typeof el.value === "string" ? el.value : fallback;
    };
    const getCheckVal = (fieldName: string, fallback: boolean) => {
      const el = formEl.elements.namedItem(fieldName) as HTMLInputElement | null;
      return el && typeof el.checked === "boolean" ? el.checked : fallback;
    };
    const rawVatStr = getInputVal("vatRate", String(base.vatRate));
    const rawVat = rawVatStr.trim() !== "" ? Number(rawVatStr) : Number.NaN;
    return {
      ...base,
      name: getInputVal("name", base.name),
      taxId: getInputVal("taxId", base.taxId),
      branchName: getInputVal("branchName", base.branchName),
      address: getInputVal("address", base.address),
      phone: getInputVal("phone", base.phone),
      email: getInputVal("email", base.email),
      vatRate: Number.isFinite(rawVat) ? rawVat : base.vatRate,
      invoicePrefix: getInputVal("invoicePrefix", base.invoicePrefix).toUpperCase(),
      footerNote: getInputVal("footerNote", base.footerNote),
      showFeeBreakdown: getCheckVal("showFeeBreakdown", base.showFeeBreakdown),
      showShippingTracking: getCheckVal(
        "showShippingTracking",
        base.showShippingTracking,
      ),
      showSkuInAbbreviated: getCheckVal(
        "showSkuInAbbreviated",
        base.showSkuInAbbreviated,
      ),
      showSkuInFull: getCheckVal("showSkuInFull", base.showSkuInFull),
      showSignatureBlock: getCheckVal(
        "showSignatureBlock",
        base.showSignatureBlock,
      ),
    };
  }

  // ล้าง sessionStorage draft เก่าที่เคยทับค่า และซิงก์ค่าจาก DOM หากผู้ใช้พิมพ์ก่อน Hydration
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setForm((prev) => {
      const next = readDomFormOverrides(formRef.current, prev);
      setVatRateInput(String(next.vatRate));
      return next;
    });
  }, []);

  // ซิงก์ค่าจาก Server เมื่อ initialSettings เปลี่ยน (เฉพาะเมื่อผู้ใช้ไม่ได้กำลังแก้ไขค้างอยู่)
  useEffect(() => {
    if (!isDirtyRef.current) {
      setForm(initialSettings);
      setVatRateInput(String(initialSettings.vatRate));
      setPreviewPaper(initialSettings.defaultPaperSize ?? "a6");
    }
  }, [initialSettings]);

  function updateForm(
    updater: (prev: Required<SellerInfo>) => Required<SellerInfo>,
  ) {
    isDirtyRef.current = true;
    setForm((prev) => updater(prev));
  }

  const previewInvoice = useMemo(() => {
    const built = buildInvoice(SAMPLE_TRANSACTION, form);
    const prefix = (form.invoicePrefix ?? "").trim();
    return {
      ...built,
      invoiceNo: `${prefix}2610/00422`,
    };
  }, [form]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedVat =
      vatRateInput.trim() !== "" && Number.isFinite(Number(vatRateInput))
        ? Number(vatRateInput)
        : form.vatRate;
    const basePayload: Required<SellerInfo> = {
      ...form,
      vatRate: parsedVat,
    };
    const payload = readDomFormOverrides(e.currentTarget, basePayload);
    setForm(payload);
    setVatRateInput(String(payload.vatRate));
    if (!payload.name.trim() || !payload.address.trim() || !payload.taxId.trim()) {
      toast.error("กรุณากรอกชื่อบริษัท ที่อยู่ และเลขผู้เสียภาษีให้ครบถ้วน");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let data: {
        ok?: boolean;
        settings?: Required<SellerInfo>;
        error?: string;
      } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as typeof data;
        } catch {
          data = {};
        }
      }
      if (!res.ok || !data.ok || !data.settings) {
        toast.error(
          data.error ?? `บันทึกการตั้งค่าไม่สำเร็จ (HTTP ${res.status})`,
        );
        return;
      }
      isDirtyRef.current = false;
      setForm(data.settings);
      setVatRateInput(String(data.settings.vatRate));
      setPreviewPaper(data.settings.defaultPaperSize);
      router.refresh();
      toast.success("บันทึกการตั้งค่าใบพิมพ์และข้อมูลบริษัทเรียบร้อยแล้ว");
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อบันทึกการตั้งค่าได้");
    } finally {
      setSaving(false);
    }
  }

  function handleResetDefault() {
    isDirtyRef.current = true;
    setForm({ ...DEFAULT_SELLER });
    setVatRateInput(String(DEFAULT_SELLER.vatRate));
    setPreviewPaper(DEFAULT_SELLER.defaultPaperSize);
    toast.info("คืนค่าเริ่มต้นบนฟอร์มแล้ว กด 'บันทึกการตั้งค่าทั้งหมด' เพื่อยืนยัน");
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      {/* ฝั่งซ้าย: ฟอร์มตั้งค่า 3 หมวด */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 xl:col-span-6"
      >
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-bold">
                1. ข้อมูลบริษัท / ผู้ขาย (Seller Profile)
              </CardTitle>
              <Badge variant="secondary">แสดงบนหัวใบกำกับภาษีทุกใบ</Badge>
            </div>
            <CardDescription>
              ปรับแก้ชื่อบริษัท สาขา ที่อยู่ และเลขผู้เสียภาษีได้ทันทีเมื่อมีการเปลี่ยนแปลงในอนาคต
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground sm:col-span-2">
              <span>ชื่อบริษัท / ชื่อผู้ประกอบการ *</span>
              <Input
                name="name"
                value={form.name}
                onChange={(e) =>
                  updateForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="เช่น บริษัท ชีเฮง จำกัด (สำนักงานใหญ่)"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) *</span>
              <Input
                name="taxId"
                value={form.taxId}
                onChange={(e) =>
                  updateForm((prev) => ({ ...prev, taxId: e.target.value }))
                }
                placeholder="0655568002694"
                className="mono"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>สาขา</span>
              <Input
                name="branchName"
                value={form.branchName}
                onChange={(e) =>
                  updateForm((prev) => ({ ...prev, branchName: e.target.value }))
                }
                placeholder="เช่น สำนักงานใหญ่ หรือ สาขาที่ 00001"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground sm:col-span-2">
              <span>ที่อยู่บริษัท (สำหรับออกใบกำกับภาษี) *</span>
              <Input
                name="address"
                value={form.address}
                onChange={(e) =>
                  updateForm((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="3675 ถนนพระรามที่ 4 แขวงพระโขนง เขตคลองเตย กรุงเทพมหานคร 10110"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>เบอร์โทรศัพท์ติดต่อ (ไม่บังคับ)</span>
              <Input
                name="phone"
                value={form.phone}
                onChange={(e) =>
                  updateForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="เว้นว่างหากไม่ต้องการแสดง"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>อีเมลติดต่อ (ไม่บังคับ)</span>
              <Input
                name="email"
                value={form.email}
                onChange={(e) =>
                  updateForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="เว้นว่างหากไม่ต้องการแสดง"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">
              2. การคำนวณภาษีและรหัสเอกสาร (Tax & Numbering)
            </CardTitle>
            <CardDescription>
              กำหนดอัตราภาษีมูลค่าเพิ่ม คำนำหน้าเลขใบกำกับภาษี และฐานยอดเงินที่ใช้คิดภาษี
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>อัตราภาษีมูลค่าเพิ่ม (VAT %)</span>
              <Input
                name="vatRate"
                type="number"
                step="0.01"
                min="0"
                max="30"
                value={vatRateInput}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => {
                  const val = e.target.value;
                  setVatRateInput(val);
                  const num = Number(val);
                  if (val.trim() !== "" && Number.isFinite(num)) {
                    updateForm((prev) => ({
                      ...prev,
                      vatRate: num,
                    }));
                  }
                }}
                className="mono"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              <span>คำนำหน้าเลขที่ใบกำกับภาษี (Invoice Prefix)</span>
              <Input
                name="invoicePrefix"
                value={form.invoicePrefix}
                onChange={(e) =>
                  updateForm((prev) => ({
                    ...prev,
                    invoicePrefix: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="TT"
                className="mono"
                maxLength={16}
              />
            </label>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-semibold text-foreground">
                ฐานยอดเงินที่ใช้คำนวณภาษีมูลค่าเพิ่ม (VAT Base)
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      id: "payout",
                      title: "คิดจากยอดที่คุณได้รับจริง (Payout)",
                      desc: "หักค่าธรรมเนียมแพลตฟอร์มออกก่อน แล้วถอด VAT จากเงินที่ร้านได้รับจริง (เช่น ฿508.21)",
                    },
                    {
                      id: "customer_paid",
                      title: "คิดจากยอดที่ลูกค้าจ่าย (Customer Paid)",
                      desc: "ถอด VAT จากยอดที่ลูกค้าชำระ (เช่น ฿554.40) โดยไม่หักค่าธรรมเนียมแพลตฟอร์ม",
                    },
                  ] as {
                    id: VatCalculationBase;
                    title: string;
                    desc: string;
                  }[]
                ).map((opt) => {
                  const active = form.vatCalculationBase === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        updateForm((prev) => ({
                          ...prev,
                          vatCalculationBase: opt.id,
                        }))
                      }
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <span className="text-xs font-bold text-foreground">
                        {active ? "● " : "○ "}
                        {opt.title}
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">
              3. รูปแบบใบพิมพ์และค่าเริ่มต้น (Print Layout & Toggles)
            </CardTitle>
            <CardDescription>
              เลือกขนาดกระดาษเริ่มต้นสำหรับเครื่องปริ้นของคุณ และเปิด/ปิดหัวข้อที่ต้องการแสดงบนใบพิมพ์
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">
                ขนาดกระดาษเริ่มต้นของ &ldquo;ใบกำกับฯ (อย่างย่อ)&rdquo;
              </span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    {
                      id: "a6",
                      label: "เครื่องปริ้นเล็ก 100×150 มม. (A6 / 1/4 A4)",
                    },
                    { id: "a4-4up", label: "A4 แบ่ง 4 ใบ (1/4 A4)" },
                    { id: "80mm", label: "สลิปความร้อน 80 มม." },
                    { id: "a4", label: "A4 เต็มแผ่น" },
                  ] as { id: DefaultInvoicePaperSize; label: string }[]
                ).map((opt) => {
                  const active = form.defaultPaperSize === opt.id;
                  return (
                    <Button
                      key={opt.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => {
                        updateForm((prev) => ({
                          ...prev,
                          defaultPaperSize: opt.id,
                        }));
                        setPreviewPaper(opt.id);
                      }}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 border-t border-border pt-3 sm:grid-cols-2">
              {(
                [
                  {
                    key: "showFeeBreakdown",
                    label: "แสดงบรรทัดส่วนลดชดเชย & หักค่าธรรมเนียมแพลตฟอร์ม",
                  },
                  {
                    key: "showShippingTracking",
                    label: "แสดงชื่อขนส่งและเลขพัสดุ (J&T / เลขพัสดุ)",
                  },
                  {
                    key: "showSkuInAbbreviated",
                    label: "แสดงรหัส SKU ในใบกำกับภาษีอย่างย่อ",
                  },
                  {
                    key: "showSkuInFull",
                    label: "แสดงคอลัมน์รหัส SKU ในใบกำกับภาษีแบบเต็มรูป",
                  },
                  {
                    key: "showSignatureBlock",
                    label: "แสดงช่องลายเซ็นท้ายใบกำกับภาษีแบบเต็มรูป",
                  },
                ] as {
                  key:
                    | "showFeeBreakdown"
                    | "showShippingTracking"
                    | "showSkuInAbbreviated"
                    | "showSkuInFull"
                    | "showSignatureBlock";
                  label: string;
                }[]
              ).map((toggle) => {
                const checked = Boolean(form[toggle.key]);
                return (
                  <label
                    key={toggle.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs font-medium hover:bg-muted/50"
                  >
                    <input
                      name={toggle.key}
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        updateForm((prev) => ({
                          ...prev,
                          [toggle.key]: e.target.checked,
                        }))
                      }
                      className="size-4 accent-primary"
                    />
                    <span>{toggle.label}</span>
                  </label>
                );
              })}
            </div>

            <label className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs font-semibold text-foreground">
              <span>
                ข้อความท้ายบิล / หมายเหตุ (เว้นว่างไว้หากไม่ต้องการแสดงข้อความท้ายบิล)
              </span>
              <Input
                name="footerNote"
                value={form.footerNote}
                onChange={(e) =>
                  updateForm((prev) => ({ ...prev, footerNote: e.target.value }))
                }
                placeholder="เว้นว่าง = ไม่แสดงข้อความท้ายบิล"
              />
            </label>
          </CardContent>
        </Card>

        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-3.5 shadow-lg backdrop-blur">
          <Button
            type="button"
            variant="outline"
            onClick={handleResetDefault}
            disabled={saving}
          >
            <RotateCcwIcon className="size-4" /> คืนค่าเริ่มต้น
          </Button>
          <Button type="submit" variant="default" disabled={saving}>
            <SaveIcon className="size-4" />
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าทั้งหมด"}
          </Button>
        </div>
      </form>

      {/* ฝั่งขวา: ตัวอย่างใบพิมพ์แบบสด (Live Preview) */}
      <div className="flex flex-col gap-3 xl:col-span-6">
        <Card data-invoice-preview-card className="sticky top-4">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold">
                  ตัวอย่างใบพิมพ์จริง (Live Preview)
                </CardTitle>
                <CardDescription>
                  ทดสอบสลับขนาดกระดาษเพื่อดูการย่อขนาดตัวอักษรอัตโนมัติ (ไม่มีการตัดคำเป็น ...)
                </CardDescription>
              </div>
              <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1">
                <Button
                  type="button"
                  size="xs"
                  variant={previewMode === "abbreviated" ? "default" : "ghost"}
                  className={
                    previewMode === "abbreviated"
                      ? "shadow-xs"
                      : "text-[#334155] hover:bg-white hover:text-[#0f172a]"
                  }
                  onClick={() => {
                    setPreviewMode("abbreviated");
                    setPreviewPaper(form.defaultPaperSize || "a6");
                  }}
                >
                  ใบกำกับฯ (อย่างย่อ)
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={previewMode === "full" ? "default" : "ghost"}
                  className={
                    previewMode === "full"
                      ? "shadow-xs"
                      : "text-[#334155] hover:bg-white hover:text-[#0f172a]"
                  }
                  onClick={() => {
                    setPreviewMode("full");
                    setPreviewPaper("a4");
                  }}
                >
                  ใบกำกับฯ (เต็มรูป)
                </Button>
              </div>
            </div>

            {previewMode === "abbreviated" ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    ทดสอบขนาดกระดาษ:
                  </span>
                  {(
                    [
                      { id: "a6", label: "100×150 มม. (A6)" },
                      { id: "a4-4up", label: "A4 แบ่ง 4 ใบ" },
                      { id: "80mm", label: "สลิป 80 มม." },
                      { id: "a4", label: "A4 เต็มแผ่น" },
                    ] as { id: InvoicePaperSize; label: string }[]
                  ).map((opt) => (
                    <Button
                      key={opt.id}
                      type="button"
                      size="xs"
                      variant={previewPaper === opt.id ? "default" : "outline"}
                      onClick={() => {
                        setPreviewPaper(opt.id);
                        updateForm((prev) => ({
                          ...prev,
                          defaultPaperSize: opt.id,
                        }));
                      }}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                {previewPaper === "a6" ||
                previewPaper === "a4-4up" ||
                previewPaper === "80mm" ? (
                  <InvoiceZoomControl compact />
                ) : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent
            data-invoice-scroll-container
            className="settings-preview-pane max-h-[78dvh] overflow-y-auto overflow-x-hidden bg-slate-100/80 p-4 rounded-b-xl"
          >
            <InvoiceDocument
              invoice={previewInvoice}
              mode={previewMode}
              paperSize={previewMode === "full" ? "a4" : previewPaper}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
