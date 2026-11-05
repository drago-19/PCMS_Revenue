"use client";

import React, { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DollarSignIcon,
  Edit2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderPlusIcon,
  LayersIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PlusIcon,
  PrinterIcon,
  ReceiptIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ExpenseLedgerTab } from "@/components/ExpenseLedgerTab";
import {
  ExpenseRecordFormDialog,
  type ExpenseRecordFormValues,
} from "@/components/ExpenseRecordFormDialog";
import {
  ExpenseReceiptPreviewDialog,
  ExpenseVoucherDialog,
} from "@/components/ExpenseVoucherDialog";
import { StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ExpenseCategory,
  ExpensePaymentStatus,
  ExpenseRecord,
  ExpensesOverviewData,
  MonthlyExpenseRow,
} from "@/lib/expenses";
import { formatTHB } from "@/lib/format";
import { cn } from "@/lib/utils";

const THAI_MONTHS: Record<string, string> = {
  "01": "มกราคม",
  "02": "กุมภาพันธ์",
  "03": "มีนาคม",
  "04": "เมษายน",
  "05": "พฤษภาคม",
  "06": "มิถุนายน",
  "07": "กรกฎาคม",
  "08": "สิงหาคม",
  "09": "กันยายน",
  "10": "ตุลาคม",
  "11": "พฤศจิกายน",
  "12": "ธันวาคม",
};

const THAI_MONTHS_SHORT: Record<string, string> = {
  "01": "ม.ค.",
  "02": "ก.พ.",
  "03": "มี.ค.",
  "04": "เม.ย.",
  "05": "พ.ค.",
  "06": "มิ.ย.",
  "07": "ก.ค.",
  "08": "ส.ค.",
  "09": "ก.ย.",
  "10": "ต.ค.",
  "11": "พ.ย.",
  "12": "ธ.ค.",
};

function formatThaiYearMonth(ym: string): string {
  const [yearStr, monthStr] = ym.split("-");
  const monthName = THAI_MONTHS[monthStr] ?? monthStr;
  const thaiYear = yearStr ? Number(yearStr) + 543 : "";
  return `${monthName} ${thaiYear} (${ym})`;
}

function formatThaiYearMonthShort(ym: string): string {
  const [yearStr, monthStr] = ym.split("-");
  const shortMonth = THAI_MONTHS_SHORT[monthStr] ?? monthStr;
  const thaiYear = yearStr ? Number(yearStr) + 543 : "";
  return `${shortMonth} ${thaiYear}`;
}

interface ExpensesManagerProps {
  initialData: ExpensesOverviewData;
  initialYear: string;
  initialShop?: string;
  initialExpSubView?: "ledger" | "wht" | "table";
  seller?: {
    name?: string;
    taxId?: string;
    address?: string;
    phone?: string;
  };
}

export function ExpensesManager({
  initialData,
  initialYear,
  initialExpSubView = "ledger",
  seller,
}: ExpensesManagerProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [data, setData] = useState<ExpensesOverviewData>(initialData);
  const [selectedYear, setSelectedYear] = useState<string>(initialYear);
  const [activeTab, setActiveTab] = useState<string>(
    initialExpSubView === "table" ? "table" : "ledger",
  );
  const [ledgerStatusPreset, setLedgerStatusPreset] = useState<string>(
    initialExpSubView === "wht" ? "wht" : "all",
  );

  React.useEffect(() => {
    if (initialExpSubView === "table") {
      setActiveTab("table");
    } else if (initialExpSubView === "wht") {
      setActiveTab("ledger");
      setLedgerStatusPreset("wht");
    } else {
      setActiveTab("ledger");
      setLedgerStatusPreset("all");
    }
  }, [initialExpSubView]);

  // Track expanded rows in table view
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>(() => {
    const latestYm = initialData.rows[0]?.yearMonth;
    return latestYm ? { [latestYm]: true } : {};
  });

  // Statement view selected month
  const [statementMonth, setStatementMonth] = useState<string>(() => {
    return initialData.rows[0]?.yearMonth ?? "";
  });

  // Category Modals
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryAccountCode, setNewCategoryAccountCode] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("rose");
  const [savingCategory, setSavingCategory] = useState(false);

  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<ExpenseCategory | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryAccountCode, setEditCategoryAccountCode] = useState("");
  const [editCategoryColor, setEditCategoryColor] = useState("slate");
  const [updatingCategory, setUpdatingCategory] = useState(false);

  const [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState(false);

  // Cell Edit Dialog (Direct amount)
  const [cellEditOpen, setCellEditOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    yearMonth: string;
    category: ExpenseCategory;
    currentAmount: number;
    currentDirect: number;
    itemCount: number;
  } | null>(null);
  const [cellAmountInput, setCellAmountInput] = useState("");
  const [cellNoteInput, setCellNoteInput] = useState("");
  const [savingCell, setSavingCell] = useState(false);

  // Full Accounting Expense Record Form Dialog (Create / Edit / Duplicate)
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null);
  const [recordFormInitial, setRecordFormInitial] = useState<ExpenseRecordFormValues>(() => ({
    entryDate: new Date().toISOString().slice(0, 10),
    categoryId: initialData.categories[0]?.id ?? 0,
    amount: "",
    vendorName: "",
    vendorTaxId: "",
    taxInvoiceNo: "",
    title: "",
    note: "",
    vatType: "none",
    whtRate: "0",
    paymentStatus: "paid",
    paymentMethod: "transfer",
    attachmentUrl: null,
    attachmentName: null,
  }));
  const [savingRecord, setSavingRecord] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  // Receipt Image Preview & Payment Voucher Print Dialogs
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<ExpenseRecord | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherRecord, setVoucherRecord] = useState<ExpenseRecord | null>(null);

  // Month Detail Sheet
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [sheetYearMonth, setSheetYearMonth] = useState<string | null>(null);
  const [sheetCategoryId, setSheetCategoryId] = useState<number | null>(null);
  const [sheetCategoryName, setSheetCategoryName] = useState<string | null>(null);
  const [sheetRecords, setSheetRecords] = useState<ExpenseRecord[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);

  // Month Print Modal
  const [printOpen, setPrintOpen] = useState(false);
  const [printMonth, setPrintMonth] = useState<string | null>(null);
  const [printRecords, setPrintRecords] = useState<ExpenseRecord[]>([]);
  const [, setLoadingPrint] = useState(false);

  const openCreateRecordModal = (preset?: Partial<ExpenseRecordFormValues>) => {
    setEditingRecord(null);
    setRecordFormInitial({
      entryDate: preset?.entryDate ?? new Date().toISOString().slice(0, 10),
      categoryId: preset?.categoryId ?? (data.categories[0]?.id ?? 0),
      amount: preset?.amount ?? "",
      vendorName: preset?.vendorName ?? "",
      vendorTaxId: preset?.vendorTaxId ?? "",
      taxInvoiceNo: preset?.taxInvoiceNo ?? "",
      title: preset?.title ?? "",
      note: preset?.note ?? "",
      vatType: preset?.vatType ?? "none",
      whtRate: preset?.whtRate ?? "0",
      paymentStatus: preset?.paymentStatus ?? "paid",
      paymentMethod: preset?.paymentMethod ?? "transfer",
      attachmentUrl: preset?.attachmentUrl ?? null,
      attachmentName: preset?.attachmentName ?? null,
    });
    setAddRecordOpen(true);
  };

  const openEditRecordModal = (rec: ExpenseRecord) => {
    setEditingRecord(rec);
    const inputAmt = rec.vatType === "exclude" ? rec.subtotalAmount : rec.amount;
    setRecordFormInitial({
      id: rec.id,
      entryDate: rec.entryDate,
      categoryId: rec.categoryId,
      amount: String(inputAmt),
      vendorName: rec.vendorName,
      vendorTaxId: rec.vendorTaxId,
      taxInvoiceNo: rec.taxInvoiceNo,
      title: rec.title,
      note: rec.note || "",
      vatType: rec.vatType,
      whtRate: String(rec.whtRate || 0),
      paymentStatus: rec.paymentStatus,
      paymentMethod: rec.paymentMethod,
      attachmentUrl: rec.attachmentUrl,
      attachmentName: rec.attachmentName,
    });
    setAddRecordOpen(true);
  };

  const openDuplicateRecordModal = (rec: ExpenseRecord) => {
    const inputAmt = rec.vatType === "exclude" ? rec.subtotalAmount : rec.amount;
    openCreateRecordModal({
      entryDate: new Date().toISOString().slice(0, 10),
      categoryId: rec.categoryId,
      amount: String(inputAmt),
      vendorName: rec.vendorName,
      vendorTaxId: rec.vendorTaxId,
      taxInvoiceNo: "",
      title: rec.title,
      note: rec.note || "",
      vatType: rec.vatType,
      whtRate: String(rec.whtRate || 0),
      paymentStatus: "paid",
      paymentMethod: rec.paymentMethod,
    });
  };

  const handleQuickCreateCategory = async (
    name: string,
    accountCode: string,
  ): Promise<ExpenseCategory | null> => {
    try {
      const res = await fetch("/api/expenses/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          accountCode: accountCode.trim(),
          color: "rose",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถเพิ่มหมวดหมู่ได้");
      }
      toast.success(`เพิ่มหมวดหมู่ "${name}" สำเร็จ`);
      await refreshData(selectedYear);
      router.refresh();
      return json.category || null;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      return null;
    }
  };

  const handleOpenPrint = async (ym: string) => {
    setPrintMonth(ym);
    setPrintOpen(true);
    setLoadingPrint(true);
    try {
      const res = await fetch(`/api/expenses/records?yearMonth=${ym}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data?.records)) {
        setPrintRecords(json.data.records);
      } else {
        setPrintRecords([]);
      }
    } catch {
      setPrintRecords([]);
    } finally {
      setLoadingPrint(false);
    }
  };

  const refreshData = async (year: string) => {
    try {
      const url = year === "all" ? "/api/expenses" : `/api/expenses?year=${year}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      }
    } catch {
      // ignore
    }
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    startTransition(() => {
      refreshData(year);
    });
  };

  const toggleMonthExpand = (ym: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [ym]: !prev[ym],
    }));
  };

  // Add Category Handler
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("กรุณาระบุชื่อหมวดหมู่รายจ่าย");
      return;
    }
    setSavingCategory(true);
    try {
      const res = await fetch("/api/expenses/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          accountCode: newCategoryAccountCode.trim(),
          color: newCategoryColor,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถเพิ่มหมวดหมู่ได้");
      }
      toast.success(`เพิ่มหมวดหมู่ "${name}" สำเร็จ`);
      setNewCategoryName("");
      setNewCategoryAccountCode("");
      setAddCategoryOpen(false);
      await refreshData(selectedYear);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSavingCategory(false);
    }
  };

  // Edit Category Handler
  const handleEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryToEdit) return;
    const name = editCategoryName.trim();
    if (!name) {
      toast.error("กรุณาระบุชื่อหมวดหมู่รายจ่าย");
      return;
    }
    setUpdatingCategory(true);
    try {
      const res = await fetch(`/api/expenses/categories/${categoryToEdit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          accountCode: editCategoryAccountCode.trim(),
          color: editCategoryColor,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถแก้ไขหมวดหมู่ได้");
      }
      toast.success(`แก้ไขหมวดหมู่ "${name}" สำเร็จ`);
      setEditCategoryOpen(false);
      setCategoryToEdit(null);
      await refreshData(selectedYear);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setUpdatingCategory(false);
    }
  };

  // Delete Category Handler
  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    setDeletingCategory(true);
    try {
      const res = await fetch(`/api/expenses/categories/${categoryToDelete.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถลบหมวดหมู่ได้");
      }
      toast.success(`ลบหมวดหมู่ "${categoryToDelete.name}" สำเร็จ`);
      setDeleteCategoryOpen(false);
      setCategoryToDelete(null);
      await refreshData(selectedYear);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setDeletingCategory(false);
    }
  };

  // Save Cell Handler (Direct monthly amount)
  const handleSaveCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell) return;
    const amountNum = parseFloat(cellAmountInput) || 0;
    if (amountNum < 0) {
      toast.error("ยอดเงินต้องมากกว่าหรือเท่ากับ 0");
      return;
    }

    setSavingCell(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearMonth: editingCell.yearMonth,
          categoryId: editingCell.category.id,
          amount: amountNum,
          note: cellNoteInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถบันทึกได้");
      }
      toast.success(
        `บันทึกยอด ${editingCell.category.name} (${editingCell.yearMonth}) สำเร็จ`,
      );
      setCellEditOpen(false);
      setEditingCell(null);
      await refreshData(selectedYear);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSavingCell(false);
    }
  };

  // Submit Full Expense Record (Create or Update)
  const handleSubmitExpenseRecord = async (values: ExpenseRecordFormValues) => {
    const amountNum = parseFloat(values.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("กรุณาระบุยอดเงินที่มากกว่า 0");
      return;
    }
    const cleanTitle = values.title.trim() || values.vendorName.trim();
    if (!cleanTitle) {
      toast.error("กรุณาระบุรายละเอียดรายการ หรือชื่อผู้จำหน่าย");
      return;
    }
    const catId = values.categoryId || categories[0]?.id || 0;
    if (!catId) {
      toast.error("กรุณาเลือกหมวดหมู่รายจ่าย");
      return;
    }

    setSavingRecord(true);
    try {
      const isEdit = Boolean(editingRecord && values.id);
      const url = isEdit
        ? `/api/expenses/records/${values.id}`
        : "/api/expenses/records";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: values.entryDate,
          categoryId: catId,
          amount: amountNum,
          vendorName: values.vendorName.trim(),
          vendorTaxId: values.vendorTaxId.trim(),
          taxInvoiceNo: values.taxInvoiceNo.trim(),
          title: cleanTitle,
          note: values.note.trim(),
          vatType: values.vatType,
          whtRate: parseFloat(values.whtRate) || 0,
          paymentStatus: values.paymentStatus,
          paymentMethod: values.paymentMethod,
          attachmentUrl: values.attachmentUrl,
          attachmentName: values.attachmentName,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถบันทึกเอกสารได้");
      }
      toast.success(
        isEdit
          ? `แก้ไขเอกสาร ${json.record?.documentNo || ""} สำเร็จ`
          : `สร้างเอกสาร ${json.record?.documentNo || ""} สำเร็จ`,
      );
      setAddRecordOpen(false);
      setEditingRecord(null);
      await refreshData(selectedYear);
      if (detailSheetOpen && sheetYearMonth === values.entryDate.slice(0, 7)) {
        await loadMonthRecords(sheetYearMonth, sheetCategoryId ?? undefined);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSavingRecord(false);
    }
  };

  // Quick Status Change Handler in Ledger Table
  const handleStatusChange = async (
    id: number,
    paymentStatus: ExpensePaymentStatus,
  ) => {
    setUpdatingStatusId(id);
    try {
      const res = await fetch(`/api/expenses/records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถเปลี่ยนสถานะได้");
      }
      const statusLabel =
        paymentStatus === "paid"
          ? "ชำระเงินแล้ว"
          : paymentStatus === "pending"
            ? "รอชำระ"
            : "ยกเลิกเอกสาร";
      toast.success(
        `อัปเดตสถานะ ${json.record?.documentNo || ""} เป็น "${statusLabel}"`,
      );
      await refreshData(selectedYear);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Load Itemized Records for Sheet
  const loadMonthRecords = async (ym: string, categoryId?: number) => {
    setLoadingSheet(true);
    try {
      let url = `/api/expenses/records?yearMonth=${ym}`;
      if (categoryId) {
        url += `&categoryId=${categoryId}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setSheetRecords(json.records);
      }
    } catch {
      toast.error("ไม่สามารถโหลดรายการรายจ่ายย่อยได้");
    } finally {
      setLoadingSheet(false);
    }
  };

  const handleOpenMonthDetail = (ym: string, cat?: ExpenseCategory) => {
    setSheetYearMonth(ym);
    setSheetCategoryId(cat ? cat.id : null);
    setSheetCategoryName(cat ? cat.name : null);
    setDetailSheetOpen(true);
    loadMonthRecords(ym, cat ? cat.id : undefined);
  };

  // Delete Record Handler
  const handleDeleteRecord = async (id: number) => {
    setDeletingRecordId(id);
    try {
      const res = await fetch(`/api/expenses/records/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถลบรายการได้");
      }
      toast.success("ลบรายการรายจ่ายสำเร็จ");
      if (sheetYearMonth) {
        await loadMonthRecords(sheetYearMonth, sheetCategoryId ?? undefined);
      }
      await refreshData(selectedYear);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setDeletingRecordId(null);
    }
  };

  const categories = data.categories;
  const rows = data.rows;
  const records = data.records ?? [];
  const stats = data.totalStats;
  const availableMonths = Array.from(
    new Set([
      ...rows.map((r) => r.yearMonth),
      ...records.map((r) => r.yearMonth),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  // Selected row for statement view
  const statementRow =
    rows.find((r) => r.yearMonth === statementMonth) ?? rows[0] ?? null;

  // Selected row for print view
  const printRow =
    printMonth ? rows.find((r) => r.yearMonth === printMonth) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {/* 4 Stat Cards */}
      <div className="stats m-0">
        <StatCard
          label="ยอดรับจากแพลตฟอร์มรวม"
          value={formatTHB(stats.totalPlatformPayout)}
          hint="ยอดรับจริงสุทธิจากทุกช่องทาง"
          tone="positive"
          icon={<WalletIcon className="size-5" />}
        />
        <StatCard
          label="รายจ่ายบริษัทรวม"
          value={formatTHB(stats.totalExpenses)}
          hint={`รวมจาก ${categories.length} หมวดหมู่ · บิลรายจ่าย ${records.filter((r) => r.paymentStatus !== "void").length} ใบ`}
          tone="negative"
          icon={<TrendingDownIcon className="size-5" />}
        />
        <StatCard
          label="กำไรคงเหลือสุทธิ (คงเหลือจริง)"
          value={formatTHB(stats.netRemaining)}
          hint="ยอดรับจากแพลตฟอร์ม - รายจ่ายบริษัททั้งหมด"
          tone={stats.netRemaining >= 0 ? "positive" : "negative"}
          icon={
            stats.netRemaining >= 0 ? (
              <TrendingUpIcon className="size-5" />
            ) : (
              <TrendingDownIcon className="size-5" />
            )
          }
        />
        <StatCard
          label="อัตรากำไรสุทธิเฉลี่ย"
          value={
            stats.profitMarginPercent !== null
              ? `${stats.profitMarginPercent.toFixed(1)}%`
              : "0.0%"
          }
          hint={`จากข้อมูลที่นำเข้าทั้งหมด ${stats.monthsCount} เดือน`}
          tone={(stats.profitMarginPercent ?? 0) >= 0 ? "brand" : "negative"}
          icon={<FileTextIcon className="size-5" />}
        />
      </div>

      {/* Main Tabs Navigation & Global Actions (Single Clean Header Row) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-full overflow-x-auto pb-0.5 scrollbar-none">
            <TabsList className="h-10 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
              <TabsTrigger
                value="ledger"
                className="gap-1.5 text-xs font-semibold data-[state=active]:bg-[#fe2c55] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 rounded-lg px-3.5 py-1.5 transition-all"
              >
                <FileTextIcon className="size-3.5" />
                รายการบิลค่าใช้จ่าย ({records.filter((r) => r.paymentStatus !== "void").length})
              </TabsTrigger>
              <TabsTrigger
                value="table"
                className="gap-1.5 text-xs font-semibold data-[state=active]:bg-[#fe2c55] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 rounded-lg px-3.5 py-1.5 transition-all"
              >
                <FileSpreadsheetIcon className="size-3.5" />
                สรุปกำไรสุทธิรายเดือน
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3.5 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs rounded-lg"
              onClick={() => setManageCategoriesOpen(true)}
            >
              <Settings2Icon className="size-3.5 text-slate-500" />
              จัดการหมวดหมู่ ({categories.length})
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 px-4 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-xs rounded-lg"
              onClick={() => openCreateRecordModal()}
            >
              <PlusIcon className="size-4" />
              สร้างบิลรายจ่ายใหม่
            </Button>
          </div>
        </div>

        {/* TAB 0 (Default): Accounting Expense Ledger (FlowAccount functions adapted) */}
        <TabsContent value="ledger" className="mt-2 flex flex-col gap-3">
          <ExpenseLedgerTab
            records={records}
            categories={categories}
            availableMonths={availableMonths}
            formatThaiYearMonth={formatThaiYearMonth}
            initialStatusFilter={ledgerStatusPreset}
            onCreateNew={() => openCreateRecordModal()}
            onEditRecord={openEditRecordModal}
            onDuplicateRecord={openDuplicateRecordModal}
            onDeleteRecord={handleDeleteRecord}
            onStatusChange={handleStatusChange}
            onPreviewReceipt={(rec) => {
              setPreviewRecord(rec);
              setReceiptPreviewOpen(true);
            }}
            onPrintVoucher={(rec) => {
              setVoucherRecord(rec);
              setVoucherOpen(true);
            }}
            onAddCategory={() => setAddCategoryOpen(true)}
            deletingRecordId={deletingRecordId}
            updatingStatusId={updatingStatusId}
          />
        </TabsContent>

        {/* TAB 1: Monthly Overview Table (Compact, fixed columns, expandable rows) */}
        <TabsContent value="table" className="mt-2 flex flex-col gap-3">
          {/* Year Filter Bar */}
          <Card className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white border border-slate-200 shadow-2xs rounded-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">
                ปีที่แสดง:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className={cn(
                    "h-7.5 px-3 text-xs font-semibold rounded-lg transition-all",
                    selectedYear === "all"
                      ? "bg-[#fe2c55] text-white hover:bg-[#e0264b] shadow-2xs"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                  )}
                  onClick={() => handleYearChange("all")}
                >
                  ทั้งหมด
                </Button>
                {data.availableYears.map((yr) => (
                  <Button
                    key={yr}
                    type="button"
                    size="sm"
                    className={cn(
                      "h-7.5 px-3 text-xs font-semibold rounded-lg transition-all",
                      selectedYear === yr
                        ? "bg-[#fe2c55] text-white hover:bg-[#e0264b] shadow-2xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                    )}
                    onClick={() => handleYearChange(yr)}
                  >
                    {Number(yr) + 543} ({yr})
                  </Button>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-500 font-medium">
              💡 คลิกที่แถวของแต่ละเดือนเพื่อดูการ์ดรายจ่ายและกรอกตัวเลข
            </span>
          </Card>

          {/* Table Container - Fixed, readable width, will never overflow sideways */}
          <Card className="overflow-hidden border border-slate-200 bg-white shadow-2xs rounded-xl">
            <div className="overflow-x-auto">
              <Table className="min-w-[920px] text-xs">
                <TableHeader sticky={false} className="bg-[#f8fafc] border-b border-slate-200">
                  <TableRow className="border-b border-slate-200">
                    <TableHead sticky={false} className="w-[130px] font-bold text-slate-800">
                      เดือน
                    </TableHead>
                    <TableHead sticky={false} className="w-[100px] text-right font-medium text-slate-600">
                      รับ TikTok
                    </TableHead>
                    <TableHead sticky={false} className="w-[100px] text-right font-medium text-slate-600">
                      รับ Shopee
                    </TableHead>
                    <TableHead sticky={false} className="w-[100px] text-right font-medium text-slate-600">
                      รับ Facebook
                    </TableHead>
                    <TableHead sticky={false} className="w-[95px] text-right font-medium text-slate-600">
                      รับ Lazada
                    </TableHead>
                    <TableHead sticky={false} className="w-[95px] text-right font-medium text-slate-600">
                      รับ LINE OA
                    </TableHead>
                    <TableHead sticky={false} className="w-[125px] bg-[#f1f5f9] text-right font-bold text-slate-900">
                      รวมรับทุกแฟลตฟอร์ม
                    </TableHead>
                    <TableHead sticky={false} className="w-[120px] bg-[#fff1f2] text-right font-bold text-rose-700">
                      รวมรายจ่ายบริษัท
                    </TableHead>
                    <TableHead sticky={false} className="w-[130px] text-right font-bold text-slate-900">
                      กำไรคงเหลือสุทธิ
                    </TableHead>
                    <TableHead sticky={false} className="w-[85px] text-right font-medium text-slate-600">
                      สัดส่วน %
                    </TableHead>
                    <TableHead sticky={false} className="w-[110px] text-center font-medium text-slate-600">
                      รายจ่าย
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        className="h-28 text-center text-slate-500"
                      >
                        ไม่พบข้อมูลบิลหรือรายได้ในช่วงเวลาที่เลือก
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const isExpanded = !!expandedMonths[row.yearMonth];
                      const activeCategoriesCount = Object.values(
                        row.categoryAmounts,
                      ).filter((amt) => amt > 0).length;

                      return (
                        <React.Fragment key={row.yearMonth}>
                          {/* Main Summary Row */}
                          <TableRow
                            className={cn(
                              "border-b transition-colors cursor-pointer",
                              isExpanded
                                ? "bg-rose-50/25 border-rose-200/60"
                                : "bg-white hover:bg-slate-50/80 border-slate-200/80",
                            )}
                            onClick={() => toggleMonthExpand(row.yearMonth)}
                          >
                            {/* Month */}
                            <TableCell className="font-bold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={cn(isExpanded ? "text-[#fe2c55]" : "text-slate-400")}>
                                  {isExpanded ? (
                                    <ChevronUpIcon className="size-4 shrink-0" />
                                  ) : (
                                    <ChevronDownIcon className="size-4 shrink-0" />
                                  )}
                                </span>
                                <span className="whitespace-nowrap font-bold text-xs text-slate-900" title={formatThaiYearMonth(row.yearMonth)}>
                                  {formatThaiYearMonthShort(row.yearMonth)}
                                </span>
                              </div>
                            </TableCell>

                            {/* TikTok */}
                            <TableCell className="text-right font-mono text-slate-600">
                              {formatTHB(row.tiktokPayout)}
                            </TableCell>

                            {/* Shopee */}
                            <TableCell className="text-right font-mono text-slate-600">
                              {formatTHB(row.shopeePayout)}
                            </TableCell>

                            {/* Facebook */}
                            <TableCell className="text-right font-mono text-slate-600">
                              {formatTHB(row.facebookPayout)}
                            </TableCell>

                            {/* Lazada */}
                            <TableCell className="text-right font-mono text-slate-600">
                              {formatTHB(row.lazadaPayout ?? 0)}
                            </TableCell>

                            {/* LINE OA */}
                            <TableCell className="text-right font-mono text-slate-600">
                              {formatTHB(row.linePayout ?? 0)}
                            </TableCell>

                            {/* Total Platform */}
                            <TableCell className="bg-slate-50/80 text-right font-mono font-bold text-slate-900">
                              {formatTHB(row.totalPlatformPayout)}
                            </TableCell>

                            {/* Total Expenses */}
                            <TableCell className="bg-rose-50/40 text-right font-mono font-bold text-rose-600">
                              <div className="flex flex-col items-end">
                                <span>{formatTHB(row.totalExpenses)}</span>
                                <span className="text-[10.5px] font-normal text-slate-500">
                                  {activeCategoriesCount} จาก {categories.length} หมวด
                                </span>
                              </div>
                            </TableCell>

                            {/* Net Remaining */}
                            <TableCell
                              className={cn(
                                "text-right font-mono font-bold text-[13px]",
                                row.netRemaining >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600",
                              )}
                            >
                              {formatTHB(row.netRemaining)}
                            </TableCell>

                            {/* Margin % */}
                            <TableCell className="text-right font-mono font-semibold text-slate-600">
                              {row.profitMarginPercent !== null
                                ? `${row.profitMarginPercent.toFixed(1)}%`
                                : "-"}
                            </TableCell>

                            {/* Expand/Collapse Button */}
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              <Button
                                type="button"
                                size="sm"
                                className={cn(
                                  "h-7 gap-1 px-2.5 text-[11px] font-bold rounded-lg transition-all",
                                  isExpanded
                                    ? "bg-[#fe2c55] text-white hover:bg-[#e0264b] shadow-2xs"
                                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                                )}
                                onClick={() => toggleMonthExpand(row.yearMonth)}
                              >
                                {isExpanded ? "ซ่อน" : "ดู/กรอก"}
                                {isExpanded ? (
                                  <ChevronUpIcon className="size-3.5" />
                                ) : (
                                  <ChevronDownIcon className="size-3.5" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>

                          {/* Expanded Section: Category Cards Grid (Never overflows sideways!) */}
                          {isExpanded && (
                            <TableRow className="border-b-2 border-slate-200 bg-[#fafbfc]">
                              <TableCell colSpan={11} className="p-4 sm:p-5">
                                <div className="flex flex-col gap-3.5">
                                  {/* Sub-header inside expanded month */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="size-2 rounded-full bg-[#fe2c55]" />
                                      <strong className="text-xs font-bold text-slate-900">
                                        รายจ่ายประจำเดือน {formatThaiYearMonth(row.yearMonth)}
                                      </strong>
                                      <Badge variant="outline" className="text-[11px] font-semibold bg-white border-rose-200 text-rose-700">
                                        รวม {formatTHB(row.totalExpenses)}
                                      </Badge>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7.5 gap-1.5 px-3 text-[11px] font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs"
                                        onClick={() => {
                                          openCreateRecordModal({
                                            entryDate: `${row.yearMonth}-01`,
                                          });
                                        }}
                                        disabled={categories.length === 0}
                                      >
                                        <PlusIcon className="size-3 text-[#fe2c55]" />
                                        เพิ่มบิลย่อยในเดือนนี้
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7.5 gap-1 px-2.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                        onClick={() => handleOpenMonthDetail(row.yearMonth)}
                                      >
                                        <FileTextIcon className="size-3 text-slate-500" />
                                        ดูรายการบิลทั้งหมด
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7.5 gap-1.5 px-2.5 text-[11px] font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs"
                                        onClick={() => handleOpenPrint(row.yearMonth)}
                                      >
                                        <PrinterIcon className="size-3 text-[#fe2c55]" />
                                        พิมพ์งบเดือนนี้
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Category Cards Grid */}
                                  {categories.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-2xs">
                                      <div className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-[#fe2c55]">
                                        <FolderPlusIcon className="size-6 stroke-[1.75]" />
                                      </div>
                                      <div className="flex flex-col gap-1 max-w-md">
                                        <p className="text-sm font-bold text-slate-800">
                                          ยังไม่มีหมวดหมู่รายจ่ายในระบบ
                                        </p>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                          เริ่มต้นสร้างหมวดหมู่รายจ่ายของคุณได้เองตามต้องการ เช่น ค่าแอดโฆษณา, ค่าเช่าสำนักงาน/โกดัง, เงินเดือนพนักงาน หรือค่าแพ็คเกจจิ้ง
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="mt-1 h-8.5 gap-1.5 px-4 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-xs rounded-lg"
                                        onClick={() => setAddCategoryOpen(true)}
                                      >
                                        <PlusIcon className="size-4" />
                                        เพิ่มหมวดหมู่แรก
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                      {categories.map((cat) => {
                                        const amt = row.categoryAmounts[cat.id] ?? 0;
                                        const direct = row.directAmounts[cat.id] ?? 0;
                                        const count = row.categoryItemCounts[cat.id] ?? 0;

                                        return (
                                          <div
                                            key={cat.id}
                                            className={cn(
                                              "flex flex-col justify-between gap-3 rounded-xl p-3.5 border transition-all bg-white shadow-2xs",
                                              amt > 0
                                                ? "border-rose-200/90 hover:border-[#fe2c55]/60 hover:shadow-sm"
                                                : "border-slate-200/90 hover:border-slate-300 hover:shadow-2xs",
                                            )}
                                          >
                                            <div className="flex items-start justify-between gap-1.5">
                                              <span
                                                className="truncate text-xs font-bold text-slate-800"
                                                title={cat.name}
                                              >
                                                {cat.name}
                                              </span>
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-6 shrink-0 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                                                    aria-label={`จัดการหมวดหมู่ ${cat.name}`}
                                                  >
                                                    <MoreVerticalIcon className="size-3.5" />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-36 bg-white border border-slate-200 shadow-md">
                                                  <DropdownMenuItem
                                                    onClick={() => {
                                                      setCategoryToEdit(cat);
                                                      setEditCategoryName(cat.name);
                                                      setEditCategoryOpen(true);
                                                    }}
                                                  >
                                                    <Edit2Icon className="mr-2 size-3.5" />
                                                    แก้ไขชื่อหมวด
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    className="text-rose-600 focus:text-rose-600"
                                                    onClick={() => {
                                                      setCategoryToDelete(cat);
                                                      setDeleteCategoryOpen(true);
                                                    }}
                                                  >
                                                    <Trash2Icon className="mr-2 size-3.5 text-rose-600" />
                                                    ลบหมวดหมู่นี้
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>

                                            <div className="flex items-baseline justify-between gap-2">
                                              <span
                                                className={cn(
                                                  "font-mono text-base font-bold",
                                                  amt > 0
                                                    ? "text-rose-600"
                                                    : "text-slate-400",
                                                )}
                                              >
                                                {amt > 0 ? formatTHB(amt) : "฿0.00"}
                                              </span>

                                              {count > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenMonthDetail(row.yearMonth, cat)}
                                                  className="text-[11px] font-semibold text-[#fe2c55] underline underline-offset-2 hover:opacity-80"
                                                >
                                                  {count} รายการย่อย
                                                </button>
                                              )}
                                            </div>

                                            {/* Action Buttons on Card */}
                                            <div className="pt-2 border-t border-slate-100">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7.5 w-full text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-[#fe2c55] hover:text-white hover:border-[#fe2c55] transition-colors shadow-2xs rounded-lg"
                                                onClick={() => {
                                                  setEditingCell({
                                                    yearMonth: row.yearMonth,
                                                    category: cat,
                                                    currentAmount: amt,
                                                    currentDirect: direct,
                                                    itemCount: count,
                                                  });
                                                  setCellAmountInput(direct > 0 ? String(direct) : "");
                                                  setCellNoteInput("");
                                                  setCellEditOpen(true);
                                                }}
                                              >
                                                <Edit2Icon className="mr-1.5 size-3" />
                                                กรอก/แก้ไขยอด
                                              </Button>
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* Quick add category card */}
                                      <button
                                        type="button"
                                        onClick={() => setAddCategoryOpen(true)}
                                        className="flex min-h-[110px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-white p-3.5 text-center text-slate-600 transition-all hover:border-[#fe2c55] hover:bg-rose-50/30 hover:text-[#fe2c55] cursor-pointer shadow-2xs group"
                                      >
                                        <div className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-rose-100 group-hover:text-[#fe2c55] transition-colors">
                                          <PlusIcon className="size-4" />
                                        </div>
                                        <span className="text-xs font-bold">
                                          + เพิ่มหมวดหมู่ใหม่
                                        </span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>

                {/* Table Footer - Grand Totals */}
                {rows.length > 0 && (
                  <TableFooter className="border-t-2 border-slate-300 bg-[#f8fafc] font-bold text-slate-900">
                    <TableRow>
                      <TableCell className="font-bold text-slate-900">
                        รวมสะสมทั้งหมด
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatTHB(rows.reduce((sum, r) => sum + r.tiktokPayout, 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatTHB(rows.reduce((sum, r) => sum + r.shopeePayout, 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatTHB(rows.reduce((sum, r) => sum + r.facebookPayout, 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatTHB(rows.reduce((sum, r) => sum + (r.lazadaPayout ?? 0), 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatTHB(rows.reduce((sum, r) => sum + (r.linePayout ?? 0), 0))}
                      </TableCell>
                      <TableCell className="bg-slate-100 text-right font-mono font-bold text-slate-900">
                        {formatTHB(stats.totalPlatformPayout)}
                      </TableCell>
                      <TableCell className="bg-rose-100/70 text-right font-mono font-bold text-rose-800">
                        {formatTHB(stats.totalExpenses)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-bold text-[13px]",
                          stats.netRemaining >= 0
                            ? "text-emerald-700"
                            : "text-rose-700",
                        )}
                      >
                        {formatTHB(stats.netRemaining)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {stats.profitMarginPercent !== null
                          ? `${stats.profitMarginPercent.toFixed(1)}%`
                          : "-"}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Manage Categories & Chart of Accounts */}
      <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
        <DialogContent className="sm:max-w-[680px] max-w-[calc(100%-1.5rem)] w-full max-h-[88dvh] overflow-y-auto bg-white border border-slate-200 shadow-2xl">
          <DialogHeader className="pr-12">
            <DialogTitle className="text-slate-900 font-bold text-base">
              จัดการหมวดหมู่รายจ่ายและรหัสผังบัญชี ({categories.length})
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              กำหนดรหัสผังบัญชี (ถ้ามี) และชื่อหมวดหมู่รายจ่ายสำหรับใช้ในบิลค่าใช้จ่ายและงบกำไรสุทธิรายเดือน
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                className="h-8.5 gap-1.5 px-3.5 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-xs rounded-lg"
                onClick={() => setAddCategoryOpen(true)}
              >
                <PlusIcon className="size-4" />
                เพิ่มหมวดหมู่ใหม่
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2.5 p-8 text-center">
                  <div className="flex size-11 items-center justify-center rounded-full bg-rose-50 text-[#fe2c55]">
                    <FolderPlusIcon className="size-5 stroke-[1.75]" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    ยังไม่มีหมวดหมู่รายจ่าย
                  </p>
                  <p className="text-xs text-slate-500 max-w-xs">
                    กดปุ่ม &ldquo;เพิ่มหมวดหมู่ใหม่&rdquo; เพื่อสร้างหมวดหมู่แรกของคุณ (หรือพิมพ์สร้างสดในหน้าต่างสร้างบิลได้เลย)
                  </p>
                </div>
              ) : (
                <Table className="text-xs">
                  <TableHeader sticky={false} className="bg-[#f8fafc] border-b border-slate-200">
                    <TableRow>
                      <TableHead sticky={false} className="w-12 text-center font-bold text-slate-700">#</TableHead>
                      <TableHead sticky={false} className="w-32 font-bold text-slate-800">รหัสผังบัญชี</TableHead>
                      <TableHead sticky={false} className="font-bold text-slate-800">ชื่อหมวดหมู่รายจ่าย</TableHead>
                      <TableHead sticky={false} className="w-36 text-center font-bold text-slate-700">การจัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((cat, idx) => (
                      <TableRow key={cat.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <TableCell className="text-center font-mono text-slate-500">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-slate-700">
                          {cat.accountCode || "-"}
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">
                          {cat.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                              onClick={() => {
                                setCategoryToEdit(cat);
                                setEditCategoryName(cat.name);
                                setEditCategoryAccountCode(cat.accountCode || "");
                                setEditCategoryColor(cat.color || "slate");
                                setEditCategoryOpen(true);
                              }}
                            >
                              <Edit2Icon className="mr-1 size-3.5" />
                              แก้ไข
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => {
                                setCategoryToDelete(cat);
                                setDeleteCategoryOpen(true);
                              }}
                            >
                              <Trash2Icon className="mr-1 size-3.5" />
                              ลบ
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add Category */}
      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-slate-900 font-bold">เพิ่มหมวดหมู่รายจ่ายและรหัสบัญชี</DialogTitle>
            <DialogDescription className="text-slate-500">
              กำหนดรหัสผังบัญชี (ถ้ามี) และชื่อหมวดหมู่ เช่น 51020.01 / การตลาดและโฆษณา
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddCategory} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="new-category-code"
                  className="text-xs font-bold text-slate-700"
                >
                  รหัสผังบัญชี
                </label>
                <Input
                  id="new-category-code"
                  type="text"
                  value={newCategoryAccountCode}
                  onChange={(e) => setNewCategoryAccountCode(e.target.value)}
                  placeholder="เช่น 53031.01"
                  className="h-10 font-mono text-xs border-slate-200"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="new-category-name"
                  className="text-xs font-bold text-slate-700"
                >
                  ชื่อหมวดหมู่รายจ่าย <span className="text-[#fe2c55]">*</span>
                </label>
                <Input
                  id="new-category-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="เช่น ค่าโฆษณา, ค่าไฟฟ้า, ค่าเช่าสำนักงาน"
                  className="h-10 text-sm border-slate-200 focus-visible:ring-[#fe2c55]"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-category-color" className="text-xs font-bold text-slate-700">
                สีป้ายหมวดหมู่
              </label>
              <Select value={newCategoryColor} onValueChange={setNewCategoryColor}>
                <SelectTrigger id="new-category-color" className="h-9 text-xs border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl z-50">
                  <SelectItem value="rose" className="text-xs">สีชมพูแดง (การตลาด/โฆษณา)</SelectItem>
                  <SelectItem value="amber" className="text-xs">สีเหลืองอำพัน (ค่าไฟ/วัสดุแพ็ค)</SelectItem>
                  <SelectItem value="blue" className="text-xs">สีฟ้า (ขนส่ง/อินเทอร์เน็ต)</SelectItem>
                  <SelectItem value="emerald" className="text-xs">สีเขียว (เงินเดือน/ค่าแรง)</SelectItem>
                  <SelectItem value="purple" className="text-xs">สีม่วง (ค่าเช่า/อุปกรณ์คอมฯ)</SelectItem>
                  <SelectItem value="cyan" className="text-xs">สีฟ้าน้ำทะเล (ค่าน้ำประปา)</SelectItem>
                  <SelectItem value="slate" className="text-xs">สีเทา (ค่าบริการทั่วไป)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setAddCategoryOpen(false)}
                disabled={savingCategory}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                className="h-9 px-4 text-xs font-bold rounded-lg bg-[#fe2c55] hover:bg-[#e0264b] text-white"
                disabled={savingCategory}
              >
                {savingCategory ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  "เพิ่มหมวดหมู่"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Category */}
      <Dialog open={editCategoryOpen} onOpenChange={setEditCategoryOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-slate-900 font-bold">แก้ไขหมวดหมู่และรหัสผังบัญชี</DialogTitle>
            <DialogDescription className="text-slate-500">ปรับปรุงรหัสผังบัญชี ชื่อหมวดหมู่ และสีป้ายกำกับ</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditCategory} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="edit-category-code"
                  className="text-xs font-bold text-slate-700"
                >
                  รหัสผังบัญชี
                </label>
                <Input
                  id="edit-category-code"
                  type="text"
                  value={editCategoryAccountCode}
                  onChange={(e) => setEditCategoryAccountCode(e.target.value)}
                  placeholder="เช่น 53031.01"
                  className="h-10 font-mono text-xs border-slate-200"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="edit-category-name"
                  className="text-xs font-bold text-slate-700"
                >
                  ชื่อหมวดหมู่ <span className="text-[#fe2c55]">*</span>
                </label>
                <Input
                  id="edit-category-name"
                  type="text"
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  className="h-10 text-sm border-slate-200 focus-visible:ring-[#fe2c55]"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-category-color" className="text-xs font-bold text-slate-700">
                สีป้ายหมวดหมู่
              </label>
              <Select value={editCategoryColor} onValueChange={setEditCategoryColor}>
                <SelectTrigger id="edit-category-color" className="h-9 text-xs border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl z-50">
                  <SelectItem value="rose" className="text-xs">สีชมพูแดง (การตลาด/โฆษณา)</SelectItem>
                  <SelectItem value="amber" className="text-xs">สีเหลืองอำพัน (ค่าไฟ/วัสดุแพ็ค)</SelectItem>
                  <SelectItem value="blue" className="text-xs">สีฟ้า (ขนส่ง/อินเทอร์เน็ต)</SelectItem>
                  <SelectItem value="emerald" className="text-xs">สีเขียว (เงินเดือน/ค่าแรง)</SelectItem>
                  <SelectItem value="purple" className="text-xs">สีม่วง (ค่าเช่า/อุปกรณ์คอมฯ)</SelectItem>
                  <SelectItem value="cyan" className="text-xs">สีฟ้าน้ำทะเล (ค่าน้ำประปา)</SelectItem>
                  <SelectItem value="slate" className="text-xs">สีเทา (ค่าบริการทั่วไป)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setEditCategoryOpen(false)}
                disabled={updatingCategory}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                className="h-9 px-4 text-xs font-bold rounded-lg bg-[#fe2c55] hover:bg-[#e0264b] text-white"
                disabled={updatingCategory}
              >
                {updatingCategory ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  "บันทึกการแก้ไข"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Category Confirmation */}
      <Dialog open={deleteCategoryOpen} onOpenChange={setDeleteCategoryOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-rose-600 font-bold">
              ยืนยันการลบหมวดหมู่รายจ่าย
            </DialogTitle>
            <DialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการลบหมวดหมู่ &ldquo;
              {categoryToDelete?.name}&rdquo;?
              ยอดรายจ่ายทั้งหมดในหมวดนี้จะถูกลบไปด้วย
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => setDeleteCategoryOpen(false)}
              disabled={deletingCategory}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-9 px-4 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleDeleteCategory}
              disabled={deletingCategory}
            >
              {deletingCategory ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  กำลังลบ...
                </>
              ) : (
                "ลบหมวดหมู่"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Cell (Direct monthly amount) */}
      <Dialog open={cellEditOpen} onOpenChange={setCellEditOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-slate-900 font-bold">
              กรอกยอดรายจ่าย · {editingCell?.category.name}
            </DialogTitle>
            <DialogDescription>
              ประจำเดือน{" "}
              {editingCell?.yearMonth ? formatThaiYearMonth(editingCell.yearMonth) : ""}
            </DialogDescription>
          </DialogHeader>

          {editingCell && (
            <form onSubmit={handleSaveCell} className="flex flex-col gap-4">
              {editingCell.itemCount > 0 && (
                <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">
                      ยอดจากรายการย่อย ({editingCell.itemCount} รายการ):
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatTHB(editingCell.currentAmount - editingCell.currentDirect)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    ยอดกรอกด้านล่างนี้จะถูกบวกเพิ่มกับยอดรายการย่อย
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="cell-amount-input"
                  className="text-xs font-bold text-slate-700"
                >
                  ยอดเงินรายจ่าย (บาท)
                </label>
                <Input
                  id="cell-amount-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={cellAmountInput}
                  onChange={(e) => setCellAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-base font-bold border-slate-200 focus-visible:ring-[#fe2c55]"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="cell-note-input"
                  className="text-xs font-medium text-slate-500"
                >
                  หมายเหตุ (ถ้ามี)
                </label>
                <Input
                  id="cell-note-input"
                  type="text"
                  value={cellNoteInput}
                  onChange={(e) => setCellNoteInput(e.target.value)}
                  placeholder="เช่น ค่าโฆษณา TikTok ยอดสรุปประจำเดือน"
                  className="h-9 text-xs border-slate-200"
                />
              </div>

              <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-4 text-xs font-semibold rounded-lg bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={() => setCellEditOpen(false)}
                  disabled={savingCell}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  className="h-9 px-4 text-xs font-bold rounded-lg bg-[#fe2c55] hover:bg-[#e0264b] text-white"
                  disabled={savingCell}
                >
                  {savingCell ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" />
                      กำลังบันทึก...
                    </>
                  ) : (
                    "บันทึกยอดเงิน"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Create / Edit Accounting Expense Record */}
      <ExpenseRecordFormDialog
        open={addRecordOpen}
        onOpenChange={setAddRecordOpen}
        categories={categories}
        editingRecord={editingRecord}
        initialValues={recordFormInitial}
        saving={savingRecord}
        onSubmit={handleSubmitExpenseRecord}
        onQuickCreateCategory={handleQuickCreateCategory}
      />

      {/* Dialog: Receipt Image Preview */}
      <ExpenseReceiptPreviewDialog
        open={receiptPreviewOpen}
        onOpenChange={setReceiptPreviewOpen}
        record={previewRecord}
        onEditRecord={openEditRecordModal}
        onOpenVoucher={(rec) => {
          setVoucherRecord(rec);
          setVoucherOpen(true);
        }}
      />

      {/* Dialog: Printable Payment Voucher (A4) */}
      <ExpenseVoucherDialog
        open={voucherOpen}
        onOpenChange={setVoucherOpen}
        record={voucherRecord}
        seller={seller}
      />

      {/* Sheet: Month Detail List */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-white border-l border-slate-200 shadow-xl">
          <SheetHeader className="pr-12">
            <SheetTitle className="text-slate-900 font-bold">
              รายการรายจ่ายย่อย ·{" "}
              {sheetYearMonth ? formatThaiYearMonth(sheetYearMonth) : ""}
            </SheetTitle>
            <SheetDescription className="text-slate-500">
              {sheetCategoryName
                ? `เฉพาะหมวด: ${sheetCategoryName}`
                : "รายการรายจ่ายทั้งหมดในเดือนนี้"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs font-bold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs"
              onClick={() => {
                openCreateRecordModal({
                  entryDate: sheetYearMonth ? `${sheetYearMonth}-01` : undefined,
                  categoryId: sheetCategoryId ?? undefined,
                });
              }}
            >
              <PlusIcon className="size-4 text-[#fe2c55]" />
              เพิ่มรายการรายจ่ายในเดือนนี้
            </Button>

            {loadingSheet ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2Icon className="size-6 animate-spin text-slate-400" />
              </div>
            ) : sheetRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 bg-[#f8fafc]">
                <FileTextIcon className="size-8 stroke-1 text-slate-400" />
                <p className="text-xs font-semibold text-slate-700">ไม่มีรายการรายจ่ายย่อยในเดือนนี้</p>
                <p className="text-[11px] text-slate-500">
                  (คุณสามารถคลิกที่ปุ่ม &ldquo;กรอก/แก้ไขยอด&rdquo; เพื่อกรอกยอดรวมประจำเดือนได้โดยตรง)
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)]">
                {sheetRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-2xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700 border-slate-200">
                          {rec.categoryName}
                        </Badge>
                        <span className="text-[11px] text-slate-500">
                          {rec.entryDate}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        {rec.title}
                      </span>
                      {rec.note && (
                        <span className="text-[11px] text-slate-500">
                          {rec.note}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-rose-600">
                        {formatTHB(rec.amount)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="ลบรายการนี้"
                        aria-label="ลบรายการนี้"
                        disabled={deletingRecordId === rec.id}
                        onClick={() => handleDeleteRecord(rec.id)}
                      >
                        {deletingRecordId === rec.id ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog: Print Monthly Statement (P&L Report) */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="sm:max-w-[840px] max-w-[calc(100%-1.5rem)] w-full max-h-[92vh] overflow-y-auto p-0 bg-white border border-slate-200 shadow-2xl print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:max-h-none print:overflow-visible">
          {/* Header Action Bar (hidden when printing) */}
          <div className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#f8fafc] px-5 py-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <PrinterIcon className="size-4 text-[#fe2c55]" />
              <span className="text-sm font-bold text-slate-800">
                พรีวิวรายงานงบรายรับ-รายจ่าย · {printMonth ? formatThaiYearMonth(printMonth) : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setPrintOpen(false)}
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
                สั่งพิมพ์ / บันทึกเป็น PDF
              </Button>
            </div>
          </div>

          {/* Printable Report Document */}
          {printRow && (
            <div className="monthly-statement-print p-6 sm:p-8 text-slate-900 bg-white print:p-0 print:m-0 print:max-w-none">
              {/* Company Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between border-b-2 border-slate-800 pb-4 gap-3">
                <div className="flex flex-col gap-1">
                  <h1 className="text-lg font-black text-slate-900 tracking-tight">
                    {seller?.name || "บริษัท ดราก้อน 19 จำกัด"}
                  </h1>
                  {seller?.taxId && (
                    <p className="text-xs text-slate-600">
                      เลขประจำตัวผู้เสียภาษี: <span className="font-mono font-bold text-slate-900">{seller.taxId}</span>
                    </p>
                  )}
                  {seller?.address && (
                    <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                      {seller.address}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:items-end gap-1">
                  <div className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 border border-slate-300">
                    รายงานงบการเงินรายเดือน
                  </div>
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    งวดประจำเดือน: {formatThaiYearMonth(printRow.yearMonth)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    พิมพ์เมื่อ: {new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              {/* Report Title */}
              <div className="my-5 text-center">
                <h2 className="text-base font-extrabold text-slate-900">
                  รายงานสรุปผลการดำเนินงาน รายรับ-รายจ่าย และกำไรสุทธิ
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  เปรียบเทียบยอดรับเงินสดสุทธิจากช่องทางจำหน่ายกับรายจ่ายจริงของบริษัท
                </p>
              </div>

              {/* SECTION 1: Platform Inflows */}
              <div className="mb-5">
                <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="size-2 rounded-full bg-emerald-600 inline-block" />
                  ส่วนที่ 1: รายรับสุทธิจากช่องทางจำหน่าย
                </h3>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold">
                      <th className="border border-slate-300 p-2 text-center w-12">#</th>
                      <th className="border border-slate-300 p-2 text-left">ช่องทางจำหน่าย</th>
                      <th className="border border-slate-300 p-2 text-left">รายละเอียดรายการเงินเข้า</th>
                      <th className="border border-slate-300 p-2 text-right w-36">ยอดรับสุทธิ (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const inflowRows: { channel: string; desc: string; amount: number }[] = [
                        {
                          channel: "TikTok Shop",
                          desc: "ยอดเงินโอนสุทธิตามรายงาน Settlement (รวมเงินชดเชยจากแพลตฟอร์ม/โลจิสติกส์)",
                          amount: printRow.tiktokPayout,
                        },
                        {
                          channel: "Shopee",
                          desc: "ยอดรับเงินสดสุทธิตามบิลขายจริง (ยอดขายหักค่าส่งที่ร้านจ่าย)",
                          amount: printRow.shopeePayout,
                        },
                        {
                          channel: "Facebook",
                          desc: "ยอดรับเงินสดสุทธิตามบิลขายจริง (ยอดขายหักค่าส่งที่ร้านจ่าย)",
                          amount: printRow.facebookPayout,
                        },
                        {
                          channel: "Lazada",
                          desc: "ยอดเงินโอนสุทธิตามรายงาน Lazada",
                          amount: printRow.lazadaPayout ?? 0,
                        },
                        {
                          channel: "LINE OA",
                          desc: "ยอดรับเงินสดสุทธิตามบิลขายจริง (ยอดขายหักค่าส่งที่ร้านจ่าย)",
                          amount: printRow.linePayout ?? 0,
                        },
                      ];
                      if ((printRow.otherPayout ?? 0) !== 0) {
                        inflowRows.push({
                          channel: "ช่องทางอื่น",
                          desc: "ยอดรับเงินสดสุทธิจากช่องทางจำหน่ายอื่น",
                          amount: printRow.otherPayout ?? 0,
                        });
                      }
                      return inflowRows.map((item, idx) => (
                        <tr key={item.channel}>
                          <td className="border border-slate-300 p-2 text-center font-mono">{idx + 1}</td>
                          <td className="border border-slate-300 p-2 font-bold text-slate-900">{item.channel}</td>
                          <td className="border border-slate-300 p-2 text-slate-600">{item.desc}</td>
                          <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                            {formatTHB(item.amount)}
                          </td>
                        </tr>
                      ));
                    })()}
                    <tr className="bg-emerald-50/70 font-bold">
                      <td colSpan={3} className="border border-slate-300 p-2.5 text-right text-emerald-950 font-extrabold">
                        รวมรายรับจากทุกช่องทางจำหน่าย
                      </td>
                      <td className="border border-slate-300 p-2.5 text-right font-mono font-black text-emerald-700 text-sm">
                        {formatTHB(printRow.totalPlatformPayout)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* SECTION 2: Company Expenses */}
              <div className="mb-5">
                <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="size-2 rounded-full bg-rose-600 inline-block" />
                  ส่วนที่ 2: รายจ่ายบริษัทจำแนกตามหมวดหมู่
                </h3>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold">
                      <th className="border border-slate-300 p-2 text-center w-12">#</th>
                      <th className="border border-slate-300 p-2 text-left">หมวดหมู่รายจ่าย</th>
                      <th className="border border-slate-300 p-2 text-center w-28">จำนวนบิลย่อย</th>
                      <th className="border border-slate-300 p-2 text-right w-36">ยอดรวม (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="border border-slate-300 p-4 text-center text-slate-500 italic">
                          ยังไม่มีการบันทึกหมวดหมู่รายจ่ายในงวดนี้
                        </td>
                      </tr>
                    ) : (
                      categories.map((cat, idx) => {
                        const amt = printRow.categoryAmounts[cat.id] ?? 0;
                        const count = printRow.categoryItemCounts[cat.id] ?? 0;
                        return (
                          <tr key={cat.id}>
                            <td className="border border-slate-300 p-2 text-center font-mono">{idx + 1}</td>
                            <td className="border border-slate-300 p-2 font-bold text-slate-800">{cat.name}</td>
                            <td className="border border-slate-300 p-2 text-center font-mono text-slate-600">
                              {count > 0 ? `${count} รายการ` : "-"}
                            </td>
                            <td className="border border-slate-300 p-2 text-right font-mono font-bold text-rose-700">
                              {amt > 0 ? formatTHB(amt) : "฿0.00"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    <tr className="bg-rose-50/70 font-bold">
                      <td colSpan={3} className="border border-slate-300 p-2.5 text-right text-rose-950 font-extrabold">
                        รวมรายจ่ายบริษัททั้งหมด
                      </td>
                      <td className="border border-slate-300 p-2.5 text-right font-mono font-black text-rose-700 text-sm">
                        {formatTHB(printRow.totalExpenses)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* SECTION 3: Itemized Records List (if any) */}
              {printRecords.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                    <span className="size-2 rounded-full bg-slate-600 inline-block" />
                    ส่วนที่ 3: รายการบิลย่อยประกอบประจำเดือน ({printRecords.length} รายการ)
                  </h3>
                  <table className="w-full border-collapse border border-slate-300 text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold">
                        <th className="border border-slate-300 p-1.5 text-center w-24">วันที่</th>
                        <th className="border border-slate-300 p-1.5 text-left w-36">หมวดหมู่</th>
                        <th className="border border-slate-300 p-1.5 text-left">รายละเอียด / ชื่อรายการ</th>
                        <th className="border border-slate-300 p-1.5 text-left w-36">หมายเหตุ/สลิป</th>
                        <th className="border border-slate-300 p-1.5 text-right w-28">ยอดเงิน (บาท)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printRecords.map((r) => (
                        <tr key={r.id}>
                          <td className="border border-slate-300 p-1.5 text-center font-mono">{r.entryDate}</td>
                          <td className="border border-slate-300 p-1.5 font-bold text-slate-800">{r.categoryName}</td>
                          <td className="border border-slate-300 p-1.5">{r.title}</td>
                          <td className="border border-slate-300 p-1.5 text-slate-500">{r.note || "-"}</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono font-bold text-slate-800">
                            {formatTHB(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SECTION 4: Net Summary Box */}
              <div className="border-2 border-slate-800 rounded-lg p-4 bg-slate-50 mb-8 monthly-statement-section-break-avoid">
                <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4 text-center sm:text-left">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      รวมรายรับจากแพลตฟอร์ม
                    </span>
                    <span className="font-mono text-base font-bold text-slate-900">
                      {formatTHB(printRow.totalPlatformPayout)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                      หัก รวมรายจ่ายบริษัท
                    </span>
                    <span className="font-mono text-base font-bold text-rose-700">
                      {formatTHB(printRow.totalExpenses)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:border-l sm:border-slate-300 sm:pl-4 print:border-l print:border-slate-300 print:pl-4">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      กำไรคงเหลือสุทธิ
                    </span>
                    <span className={cn(
                      "font-mono text-xl font-black flex flex-wrap items-baseline gap-1.5",
                      printRow.netRemaining >= 0 ? "text-emerald-700" : "text-rose-700"
                    )}>
                      <span>{formatTHB(printRow.netRemaining)}</span>
                      <span className="text-xs font-normal text-slate-600">
                        ({printRow.profitMarginPercent !== null ? `${printRow.profitMarginPercent.toFixed(1)}%` : "-"})
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 5: Signatures Block */}
              <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-6 pt-4 text-center text-xs print:pt-6 monthly-statement-section-break-avoid">
                <div className="flex flex-col items-center gap-7">
                  <span>ลงชื่อ ....................................................</span>
                  <div className="flex flex-col gap-0.5 text-slate-600">
                    <span className="font-bold text-slate-800">( .................................................... )</span>
                    <span>ผู้จัดทำรายงาน</span>
                    <span>วันที่ ...... / ...... / ..........</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-7">
                  <span>ลงชื่อ ....................................................</span>
                  <div className="flex flex-col gap-0.5 text-slate-600">
                    <span className="font-bold text-slate-800">( .................................................... )</span>
                    <span>ผู้ตรวจสอบบัญชี</span>
                    <span>วันที่ ...... / ...... / ..........</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-7">
                  <span>ลงชื่อ ....................................................</span>
                  <div className="flex flex-col gap-0.5 text-slate-600">
                    <span className="font-bold text-slate-800">( .................................................... )</span>
                    <span>กรรมการผู้มีอำนาจลงนาม</span>
                    <span>วันที่ ...... / ...... / ..........</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Media Style Override */}
      {printOpen && (
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
          .monthly-statement-print {
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
          .monthly-statement-print table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .monthly-statement-print tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .monthly-statement-section-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        `}</style>
      )}
    </div>
  );
}
