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
  buildDocumentPatternFromLead,
  DEFAULT_CHANNEL_INVOICE_PREFIXES,
  DEFAULT_SELLER,
  extractDocumentLeadPrefix,
  formatReceiptNoWithPrefix,
  formatRunningDocumentNo,
  resolveChannelInvoicePrefix,
  type ChannelInvoicePrefixes,
  type DefaultInvoicePaperSize,
  type InvoiceChannelKey,
  type SellerInfo,
  type VatCalculationBase,
} from "@/lib/seller";

const PLATFORM_PREFIX_FIELDS: {
  key: InvoiceChannelKey;
  label: string;
  badge: string;
  defaultLead: string;
  badgeVariant: "default" | "shopee" | "facebook" | "lazada" | "line" | "other";
  dotClass: string;
  titleColorClass: string;
  headerBgClass: string;
  cardBorderClass: string;
  activeCardClass: string;
  activePreviewBtnClass: string;
}[] = [
  {
    key: "TikTok",
    label: "TikTok Shop",
    badge: "TikTok",
    defaultLead: "TT",
    badgeVariant: "default",
    dotClass: "bg-[#ff2c55]",
    titleColorClass: "text-[#be123c]",
    headerBgClass: "bg-[#fff1f3] border-[#fecdd3]",
    cardBorderClass: "border-[#fecdd3] bg-[#fff1f3]/25 hover:bg-[#fff1f3]/45",
    activeCardClass:
      "border-[#ff2c55] bg-[#fff1f3]/55 ring-2 ring-[#ff2c55]/25 shadow-xs",
    activePreviewBtnClass:
      "border-[#ff2c55] bg-[#ff2c55] text-white hover:bg-[#e0244a] hover:text-white",
  },
  {
    key: "Shopee",
    label: "Shopee",
    badge: "Shopee",
    defaultLead: "SP",
    badgeVariant: "shopee",
    dotClass: "bg-[#ee4d2d]",
    titleColorClass: "text-[#c23315]",
    headerBgClass: "bg-[#fff2ee] border-[#fed7aa]",
    cardBorderClass: "border-[#fed7aa] bg-[#fff2ee]/25 hover:bg-[#fff2ee]/45",
    activeCardClass:
      "border-[#ee4d2d] bg-[#fff2ee]/60 ring-2 ring-[#ee4d2d]/25 shadow-xs",
    activePreviewBtnClass:
      "border-[#ee4d2d] bg-[#ee4d2d] text-white hover:bg-[#d73211] hover:text-white",
  },
  {
    key: "Facebook",
    label: "Facebook",
    badge: "Facebook",
    defaultLead: "FB",
    badgeVariant: "facebook",
    dotClass: "bg-[#1877F2]",
    titleColorClass: "text-[#1d4ed8]",
    headerBgClass: "bg-[#eff6ff] border-[#bfdbfe]",
    cardBorderClass: "border-[#bfdbfe] bg-[#eff6ff]/30 hover:bg-[#eff6ff]/55",
    activeCardClass:
      "border-[#1877F2] bg-[#eff6ff]/65 ring-2 ring-[#1877F2]/25 shadow-xs",
    activePreviewBtnClass:
      "border-[#1877F2] bg-[#1877F2] text-white hover:bg-[#166fe5] hover:text-white",
  },
  {
    key: "Lazada",
    label: "Lazada",
    badge: "Lazada",
    defaultLead: "LZ",
    badgeVariant: "lazada",
    dotClass: "bg-[#0f146d]",
    titleColorClass: "text-[#0f146d]",
    headerBgClass: "bg-[#eef2ff] border-[#c7d2fe]",
    cardBorderClass: "border-[#c7d2fe] bg-[#eef2ff]/30 hover:bg-[#eef2ff]/55",
    activeCardClass:
      "border-[#0f146d] bg-[#eef2ff]/65 ring-2 ring-[#0f146d]/25 shadow-xs",
    activePreviewBtnClass:
      "border-[#0f146d] bg-[#0f146d] text-white hover:bg-[#0c1059] hover:text-white",
  },
  {
    key: "LINE",
    label: "LINE OA",
    badge: "LINE OA",
    defaultLead: "LN",
    badgeVariant: "line",
    dotClass: "bg-[#06C755]",
    titleColorClass: "text-[#047857]",
    headerBgClass: "bg-[#ecfdf5] border-[#a7f3d0]",
    cardBorderClass: "border-[#a7f3d0] bg-[#ecfdf5]/30 hover:bg-[#ecfdf5]/55",
    activeCardClass:
      "border-[#06C755] bg-[#ecfdf5]/65 ring-2 ring-[#06C755]/25 shadow-xs",
    activePreviewBtnClass:
      "border-[#06C755] bg-[#06C755] text-white hover:bg-[#05b34c] hover:text-white",
  },
  {
    key: "Other",
    label: "อื่นๆ (Other)",
    badge: "Other",
    defaultLead: "OT",
    badgeVariant: "other",
    dotClass: "bg-[#475569]",
    titleColorClass: "text-[#334155]",
    headerBgClass: "bg-[#f1f5f9] border-[#cbd5e1]",
    cardBorderClass: "border-[#cbd5e1] bg-[#f8fafc] hover:bg-[#f1f5f9]/70",
    activeCardClass:
      "border-[#475569] bg-[#f1f5f9]/85 ring-2 ring-[#475569]/25 shadow-xs",
    activePreviewBtnClass:
      "border-[#475569] bg-[#475569] text-white hover:bg-[#334155] hover:text-white",
  },
];

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
  weightEstimated: 3500,
  weightCharged: 3500,
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
      platformDiscount: 138.6,
      customerPayment: 554.4,
      shippingActual: -57,
      shippingCustomerFee: 0,
      shippingPlatformDiscount: 55,
      weightEstimated: 3500,
      weightCharged: 3500,
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
  invoiceNo: "SEQ/00001",
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
  defaultSettings = DEFAULT_SELLER,
}: {
  initialSettings: Required<SellerInfo>;
  defaultSettings?: Required<SellerInfo>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const isDirtyRef = useRef(false);
  const [form, setForm] = useState<Required<SellerInfo>>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<InvoiceMode>("abbreviated");
  const [previewChannel, setPreviewChannel] =
    useState<InvoiceChannelKey>("TikTok");
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
    const rawInvLead = formEl.elements.namedItem(
      "invoiceLeadPrefix",
    ) as HTMLInputElement | null;
    const rawRecLead = formEl.elements.namedItem(
      "receiptLeadPrefix",
    ) as HTMLInputElement | null;
    const nextChannelPrefixes: ChannelInvoicePrefixes = {
      ...(base.channelInvoicePrefixes ?? DEFAULT_CHANNEL_INVOICE_PREFIXES),
    };
    for (const pf of PLATFORM_PREFIX_FIELDS) {
      const fieldName =
        pf.key === "TikTok"
          ? "invoiceLeadPrefix"
          : `channelLeadPrefix_${pf.key}`;
      const el = formEl.elements.namedItem(fieldName) as HTMLInputElement | null;
      if (el && typeof el.value === "string") {
        nextChannelPrefixes[pf.key] = buildDocumentPatternFromLead(el.value);
      }
    }
    const nextInvoicePrefix =
      rawInvLead && typeof rawInvLead.value === "string"
        ? buildDocumentPatternFromLead(rawInvLead.value)
        : nextChannelPrefixes.TikTok ||
          getInputVal("invoicePrefix", base.invoicePrefix).toUpperCase();
    nextChannelPrefixes.TikTok = nextInvoicePrefix;
    const nextReceiptPrefix =
      rawRecLead && typeof rawRecLead.value === "string"
        ? buildDocumentPatternFromLead(rawRecLead.value)
        : getInputVal("receiptPrefix", base.receiptPrefix).toUpperCase();
    return {
      ...base,
      name: getInputVal("name", base.name),
      taxId: getInputVal("taxId", base.taxId),
      branchName: getInputVal("branchName", base.branchName),
      address: getInputVal("address", base.address),
      phone: getInputVal("phone", base.phone),
      email: getInputVal("email", base.email),
      vatRate: 7,
      invoicePrefix: nextInvoicePrefix,
      channelInvoicePrefixes: nextChannelPrefixes,
      receiptPrefix: nextReceiptPrefix,
      footerNote: getInputVal("footerNote", base.footerNote),
      showInvoiceNo: getCheckVal("showInvoiceNo", base.showInvoiceNo),
      showReceiptNo: getCheckVal("showReceiptNo", base.showReceiptNo),
      enableFullTaxInvoice: getCheckVal(
        "enableFullTaxInvoice",
        base.enableFullTaxInvoice,
      ),
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
    setForm((prev) => readDomFormOverrides(formRef.current, prev));
  }, []);

  // ซิงก์ค่าจาก Server เมื่อ initialSettings เปลี่ยน (เฉพาะเมื่อผู้ใช้ไม่ได้กำลังแก้ไขค้างอยู่)
  useEffect(() => {
    if (!isDirtyRef.current) {
      setForm(initialSettings);
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
    const activeChannelPattern = resolveChannelInvoicePrefix(
      form.invoicePrefix,
      previewChannel,
      form.channelInvoicePrefixes,
    );
    const prefixYmMatch = /(\d{2})(0[1-9]|1[0-2])(?=\D*\d+\D*$)/.exec(
      activeChannelPattern || form.invoicePrefix || form.receiptPrefix || "",
    );
    const previewPaidDate = prefixYmMatch
      ? `20${prefixYmMatch[1]}-${prefixYmMatch[2]}-26`
      : SAMPLE_TRANSACTION.paidDate;
    return buildInvoice(
      {
        ...SAMPLE_TRANSACTION,
        channel: previewChannel,
        paidDate: previewPaidDate,
      },
      form,
    );
  }, [form, previewChannel]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const basePayload: Required<SellerInfo> = {
      ...form,
      vatRate: 7,
    };
    const payload = readDomFormOverrides(e.currentTarget, basePayload);
    setForm(payload);
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
      setPreviewPaper(data.settings.defaultPaperSize);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("pcms:company-name-changed", {
            detail: data.settings.name,
          }),
        );
      }
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
    setForm({ ...defaultSettings });
    setPreviewPaper(defaultSettings.defaultPaperSize);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pcms:company-name-changed", {
          detail: defaultSettings.name,
        }),
      );
    }
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
                onChange={(e) => {
                  const nextName = e.target.value;
                  updateForm((prev) => ({ ...prev, name: nextName }));
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("pcms:company-name-changed", {
                        detail: nextName,
                      }),
                    );
                  }
                }}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-bold">
                2. รหัสเอกสารและคำนำหน้าแยกตามแพลตฟอร์ม (Platform Document Numbering)
              </CardTitle>
              <Badge variant="secondary">รันแยกแต่ละแพลตฟอร์ม (00001 ใหม่ทุกเดือน)</Badge>
            </div>
            <CardDescription>
              กำหนดอักษรนำหน้าแยกตามแพลตฟอร์ม (เช่น TikTok = TT, Shopee = SP, Facebook = FB) ส่วนปี-เดือน (YYMM) จะดึงตามวันที่บิลจริง และเริ่มนับ 00001 แยกกันในแต่ละแพลตฟอร์มทุกเดือนอัตโนมัติ
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="flex flex-col gap-2 sm:col-span-12">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
                <span>อักษรนำหน้าใบเสร็จรับเงิน (Receipt Prefix)</span>
                <div className="flex flex-wrap items-stretch gap-2">
                  <Input
                    name="receiptLeadPrefix"
                    value={extractDocumentLeadPrefix(form.receiptPrefix)}
                    onChange={(e) =>
                      updateForm((prev) => ({
                        ...prev,
                        receiptPrefix: buildDocumentPatternFromLead(
                          e.target.value,
                        ),
                      }))
                    }
                    placeholder="เช่น INV หรือ RC"
                    className="mono w-24 shrink-0 font-bold uppercase"
                    maxLength={12}
                    aria-label="อักษรนำหน้าใบเสร็จรับเงิน"
                  />
                  <div
                    className="mono flex items-center justify-center rounded-[10px] border border-dashed border-border bg-muted/50 px-3 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                    title="ระบบเติมรหัสแพลตฟอร์มและปี-เดือน (YYMM) ตามวันที่บิล และเริ่มนับ 00001 ใหม่ทุกเดือนอัตโนมัติ"
                  >
                    + -แพลตฟอร์ม + YYMM/00001
                  </div>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-1.5 rounded-lg border border-border/80 bg-muted/25 px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <span>ตัวอย่างแยกแพลตฟอร์ม:</span>
                    <span className="mono font-semibold text-foreground break-all">
                      {formatReceiptNoWithPrefix(
                        "SEQ/2610/00001",
                        form.receiptPrefix,
                        "2026-10-01",
                        "TikTok",
                        form.channelInvoicePrefixes,
                        form.invoicePrefix,
                      )}{" "}
                      ·{" "}
                      {formatReceiptNoWithPrefix(
                        "SEQ/SHOPEE/2610/00001",
                        form.receiptPrefix,
                        "2026-10-01",
                        "Shopee",
                        form.channelInvoicePrefixes,
                        form.invoicePrefix,
                      )}
                    </span>
                  </div>
                </div>
              </label>
            </div>

            <div className="sm:col-span-12 border-t border-border pt-3">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">
                  ตั้งค่าคำนำหน้าใบกำกับภาษีแยกตามแพลตฟอร์ม (คลิกเลือกเพื่อดูตัวอย่างด้านขวา)
                </span>
                <span className="text-[11px] text-muted-foreground">
                  แต่ละแพลตฟอร์มรันเลข 00001 แยกกันไม่ปนกัน
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PLATFORM_PREFIX_FIELDS.map((pf) => {
                  const currentPattern = resolveChannelInvoicePrefix(
                    form.invoicePrefix,
                    pf.key,
                    form.channelInvoicePrefixes,
                  );
                  const currentLead = extractDocumentLeadPrefix(currentPattern);
                  const inputName =
                    pf.key === "TikTok"
                      ? "invoiceLeadPrefix"
                      : `channelLeadPrefix_${pf.key}`;
                  const isPreviewActive = previewChannel === pf.key;
                  return (
                    <div
                      key={pf.key}
                      onClick={() => setPreviewChannel(pf.key)}
                      className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors cursor-pointer ${
                        isPreviewActive
                          ? pf.activeCardClass
                          : pf.cardBorderClass
                      }`}
                    >
                      <label className="flex flex-col gap-2 text-xs font-semibold text-foreground cursor-pointer">
                        <div
                          className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 ${pf.headerBgClass}`}
                        >
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-extrabold ${pf.titleColorClass}`}
                          >
                            <span
                              className={`size-2.5 shrink-0 rounded-full ${pf.dotClass}`}
                              aria-hidden="true"
                            />
                            {pf.label}
                          </span>
                          <Badge
                            variant={pf.badgeVariant}
                            size="sm"
                            className="text-[10px] shadow-2xs"
                          >
                            {isPreviewActive
                              ? `${pf.badge} · กำลังดูตัวอย่าง`
                              : pf.badge}
                          </Badge>
                        </div>
                        <div className="flex items-stretch gap-1.5">
                          <Input
                            name={inputName}
                            value={currentLead}
                            onFocus={() => setPreviewChannel(pf.key)}
                            onChange={(e) => {
                              const nextPattern = buildDocumentPatternFromLead(
                                e.target.value,
                              );
                              updateForm((prev) => ({
                                ...prev,
                                ...(pf.key === "TikTok"
                                  ? { invoicePrefix: nextPattern }
                                  : {}),
                                channelInvoicePrefixes: {
                                  ...(prev.channelInvoicePrefixes ??
                                    DEFAULT_CHANNEL_INVOICE_PREFIXES),
                                  [pf.key]: nextPattern,
                                },
                              }));
                            }}
                            placeholder={`เช่น ${pf.defaultLead}`}
                            className="mono w-24 shrink-0 bg-background font-bold uppercase"
                            maxLength={12}
                            aria-label={
                              pf.key === "TikTok"
                                ? "อักษรนำหน้าใบกำกับภาษี"
                                : `อักษรนำหน้าใบกำกับภาษี ${pf.label}`
                            }
                          />
                          <div className="mono flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-border bg-muted/50 px-2 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                            + YYMM/00001
                          </div>
                        </div>
                      </label>
                      <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span>ใบกำกับฯ ต.ค.:</span>
                          <span className="mono text-[10.5px] font-semibold text-foreground break-all">
                            {formatRunningDocumentNo(
                              currentPattern,
                              1,
                              DEFAULT_CHANNEL_INVOICE_PREFIXES[pf.key],
                              "2026-10-01",
                            )}{" "}
                            →{" "}
                            {formatRunningDocumentNo(
                              currentPattern,
                              2,
                              DEFAULT_CHANNEL_INVOICE_PREFIXES[pf.key],
                              "2026-10-01",
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span>ใบเสร็จ ต.ค.:</span>
                          <span className="mono text-[10.5px] font-semibold text-slate-700 break-all">
                            {formatReceiptNoWithPrefix(
                              "SEQ/2610/00001",
                              form.receiptPrefix,
                              "2026-10-01",
                              pf.key,
                              form.channelInvoicePrefixes,
                              form.invoicePrefix,
                            )}{" "}
                            →{" "}
                            {formatReceiptNoWithPrefix(
                              "SEQ/2610/00002",
                              form.receiptPrefix,
                              "2026-10-01",
                              pf.key,
                              form.channelInvoicePrefixes,
                              form.invoicePrefix,
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span>พ.ย.:</span>
                          <span className="mono text-[10.5px] font-semibold text-emerald-700 break-all">
                            เริ่ม{" "}
                            {formatRunningDocumentNo(
                              currentPattern,
                              1,
                              DEFAULT_CHANNEL_INVOICE_PREFIXES[pf.key],
                              "2026-11-01",
                            )}{" "}
                            ใหม่
                          </span>
                        </div>
                      </div>
                    </div>
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
                    key: "showInvoiceNo",
                    label: "แสดงเลขที่ใบกำกับฯ (เลขที่ใบกำกับภาษี)",
                  },
                  {
                    key: "showReceiptNo",
                    label: "แสดงหมายเลขใบเสร็จ (ใบเสร็จ:)",
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
                    key: "enableFullTaxInvoice",
                    label:
                      "เปิดใช้งานใบกำกับภาษีแบบเต็มรูป (แสดงปุ่ม 'ใบกำกับฯ แบบเต็มรูป' ในหน้าบิลและหน้าพิมพ์)",
                  },
                  ...(form.enableFullTaxInvoice
                    ? [
                        {
                          key: "showSkuInFull" as const,
                          label: "แสดงคอลัมน์รหัส SKU ในใบกำกับภาษีแบบเต็มรูป",
                        },
                        {
                          key: "showSignatureBlock" as const,
                          label: "แสดงช่องลายเซ็นท้ายใบกำกับภาษีแบบเต็มรูป",
                        },
                      ]
                    : []),
                ] as {
                  key:
                    | "showInvoiceNo"
                    | "showReceiptNo"
                    | "enableFullTaxInvoice"
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
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs font-medium hover:bg-muted/50 ${
                      toggle.key === "enableFullTaxInvoice"
                        ? "sm:col-span-2 border-primary/30 bg-primary/[0.04]"
                        : ""
                    }`}
                  >
                    <input
                      name={toggle.key}
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const nextChecked = e.target.checked;
                        updateForm((prev) => ({
                          ...prev,
                          [toggle.key]: nextChecked,
                        }));
                        if (toggle.key === "enableFullTaxInvoice") {
                          if (!nextChecked) {
                            setPreviewMode("abbreviated");
                            setPreviewPaper(form.defaultPaperSize || "a6");
                          }
                        } else if (
                          toggle.key === "showSkuInFull" ||
                          toggle.key === "showSignatureBlock"
                        ) {
                          setPreviewMode("full");
                          setPreviewPaper("a4");
                        } else if (toggle.key === "showSkuInAbbreviated") {
                          setPreviewMode("abbreviated");
                          setPreviewPaper(form.defaultPaperSize || "a6");
                        }
                      }}
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

        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:gap-3 sm:p-3.5">
          {/* <Button
            type="button"
            variant="outline"
            onClick={handleResetDefault}
            disabled={saving}
            className="flex-1 sm:flex-initial"
          >
            <RotateCcwIcon className="size-4" /> คืนค่าเริ่มต้น
          </Button> */}
          <Button
            type="submit"
            variant="default"
            loading={saving}
            className="flex-1 sm:flex-initial"
          >
            {saving ? null : <SaveIcon className="size-4" />}
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าทั้งหมด"}
          </Button>
        </div>
      </form>

      {/* ฝั่งขวา: ตัวอย่างใบพิมพ์แบบสด (Live Preview) */}
      <div className="flex flex-col gap-3 xl:col-span-6">
        <Card data-invoice-preview-card className="xl:sticky xl:top-4">
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
              {form.enableFullTaxInvoice ? (
                <div className="grid w-full grid-cols-2 items-center gap-1 rounded-xl border border-border bg-[#f1f5f9] p-1 sm:inline-flex sm:w-auto">
                  <Button
                    type="button"
                    size="xs"
                    variant={previewMode === "abbreviated" ? "default" : "ghost"}
                    className={
                      previewMode === "abbreviated"
                        ? "w-full justify-center shadow-xs sm:w-auto"
                        : "w-full justify-center text-[#334155] hover:bg-white hover:text-[#0f172a] sm:w-auto"
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
                        ? "w-full justify-center shadow-xs sm:w-auto"
                        : "w-full justify-center text-[#334155] hover:bg-white hover:text-[#0f172a] sm:w-auto"
                    }
                    onClick={() => {
                      setPreviewMode("full");
                      setPreviewPaper("a4");
                    }}
                  >
                    ใบกำกับฯ (เต็มรูป)
                  </Button>
                </div>
              ) : (
                <Badge variant="default" size="sm" className="px-3 py-1 font-bold">
                  ใบกำกับฯ (อย่างย่อ)
                </Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
              <span className="text-xs font-semibold text-muted-foreground">
                แพลตฟอร์มตัวอย่าง:
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {PLATFORM_PREFIX_FIELDS.map((pf) => {
                  const active = previewChannel === pf.key;
                  return (
                    <Button
                      key={pf.key}
                      type="button"
                      size="xs"
                      variant="outline"
                      className={
                        active
                          ? pf.activePreviewBtnClass
                          : "bg-white text-foreground hover:bg-muted"
                      }
                      onClick={() => setPreviewChannel(pf.key)}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          active ? "bg-white" : pf.dotClass
                        }`}
                        aria-hidden="true"
                      />
                      {pf.badge} (
                      {extractDocumentLeadPrefix(
                        resolveChannelInvoicePrefix(
                          form.invoicePrefix,
                          pf.key,
                          form.channelInvoicePrefixes,
                        ),
                      ) || "ไม่มี"}
                      )
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex min-h-[54px] flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
              {previewMode === "abbreviated" ? (
                <>
                  <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                    <span className="text-xs font-semibold text-muted-foreground">
                      ทดสอบขนาดกระดาษ:
                    </span>
                    <div className="grid w-full grid-cols-2 gap-1.5 sm:inline-flex sm:w-auto sm:flex-wrap sm:items-center">
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
                          className="w-full justify-center sm:w-auto"
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
                  </div>
                  <div className="flex min-h-[28px] items-center">
                    {previewPaper === "a6" ||
                    previewPaper === "a4-4up" ||
                    previewPaper === "80mm" ? (
                      <InvoiceZoomControl compact />
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        ขนาดมาตรฐาน A4 เต็มแผ่น (100%)
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex min-h-[28px] items-center">
                    <span className="text-xs font-semibold text-muted-foreground">
                      ขนาดกระดาษ: มาตรฐาน A4 เต็มแผ่น (ใบกำกับภาษีแบบเต็มรูป)
                    </span>
                  </div>
                  <div className="flex min-h-[28px] items-center">
                    <span className="text-xs font-medium text-muted-foreground">
                      แสดงข้อมูลผู้ซื้อและตารางภาษีมูลค่าเพิ่มครบถ้วน
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent
            data-invoice-scroll-container
            className="settings-preview-pane h-[72dvh] max-h-[72dvh] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] bg-slate-100/80 p-4 rounded-b-xl"
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
