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
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
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
  seller,
}: ExpensesManagerProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [data, setData] = useState<ExpensesOverviewData>(initialData);
  const [selectedYear, setSelectedYear] = useState<string>(initialYear);
  const [activeTab, setActiveTab] = useState<string>("table");

  // Track expanded rows in table view
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>(() => {
    // Default expand the latest month
    const latestYm = initialData.rows[0]?.yearMonth;
    return latestYm ? { [latestYm]: true } : {};
  });

  // Statement view selected month
  const [statementMonth, setStatementMonth] = useState<string>(() => {
    return initialData.rows[0]?.yearMonth ?? "";
  });

  // Category Modals
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<ExpenseCategory | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
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

  // Add Itemized Record Dialog
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [recordDate, setRecordDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [recordCategoryId, setRecordCategoryId] = useState<number>(() => {
    return initialData.categories[0]?.id ?? 0;
  });
  const [recordAmount, setRecordAmount] = useState("");
  const [recordTitle, setRecordTitle] = useState("");
  const [recordNote, setRecordNote] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);

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
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถเพิ่มหมวดหมู่ได้");
      }
      toast.success(`เพิ่มหมวดหมู่ "${name}" สำเร็จ`);
      setNewCategoryName("");
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
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถแก้ไขหมวดหมู่ได้");
      }
      toast.success(`แก้ไขชื่อหมวดหมู่เป็น "${name}" สำเร็จ`);
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

  // Add Itemized Record Handler
  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(recordAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("กรุณาระบุยอดเงินที่มากกว่า 0");
      return;
    }
    if (!recordTitle.trim()) {
      toast.error("กรุณาระบุรายละเอียดหรือชื่อรายการ");
      return;
    }
    const catId = recordCategoryId || categories[0]?.id || 0;
    if (!catId) {
      toast.error("กรุณาเลือกหมวดหมู่รายจ่าย");
      return;
    }

    setSavingRecord(true);
    try {
      const res = await fetch("/api/expenses/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: recordDate,
          categoryId: catId,
          amount: amountNum,
          title: recordTitle.trim(),
          note: recordNote.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "ไม่สามารถบันทึกรายการได้");
      }
      toast.success("บันทึกรายการรายจ่ายสำเร็จ");
      setRecordAmount("");
      setRecordTitle("");
      setRecordNote("");
      setAddRecordOpen(false);
      await refreshData(selectedYear);
      if (detailSheetOpen && sheetYearMonth === recordDate.slice(0, 7)) {
        await loadMonthRecords(sheetYearMonth, sheetCategoryId ?? undefined);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSavingRecord(false);
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
  const stats = data.totalStats;

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
          hint="ยอดรับจริงสุทธิ (TikTok + Shopee + Facebook)"
          tone="positive"
          icon={<WalletIcon className="size-5" />}
        />
        <StatCard
          label="รายจ่ายบริษัทรวม"
          value={formatTHB(stats.totalExpenses)}
          hint={`รวมจาก ${categories.length} หมวดหมู่รายจ่าย`}
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

      {/* Main Tabs Navigation & Global Actions */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-full overflow-x-auto pb-0.5 scrollbar-none">
            <TabsList className="h-10 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
              <TabsTrigger
                value="table"
                className="gap-1.5 text-xs font-semibold data-[state=active]:bg-[#fe2c55] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 rounded-lg px-3 py-1.5 transition-all"
              >
                <FileSpreadsheetIcon className="size-3.5" />
                ตารางสรุปรายเดือน
              </TabsTrigger>
              <TabsTrigger
                value="statement"
                className="gap-1.5 text-xs font-semibold data-[state=active]:bg-[#fe2c55] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 rounded-lg px-3 py-1.5 transition-all"
              >
                <ReceiptIcon className="size-3.5" />
                งบรายจ่าย (P&L)
              </TabsTrigger>
              <TabsTrigger
                value="categories"
                className="gap-1.5 text-xs font-semibold data-[state=active]:bg-[#fe2c55] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 rounded-lg px-3 py-1.5 transition-all"
              >
                <Settings2Icon className="size-3.5" />
                หมวดหมู่ ({categories.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3.5 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs"
              onClick={() => setAddRecordOpen(true)}
              disabled={categories.length === 0}
            >
              <PlusIcon className="size-4 text-[#fe2c55]" />
              บันทึกรายการย่อย
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 px-3.5 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-xs"
              onClick={() => setAddCategoryOpen(true)}
            >
              <PlusIcon className="size-4" />
              เพิ่มหมวดหมู่รายจ่าย
            </Button>
          </div>
        </div>

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
              <Table className="min-w-[760px] text-xs">
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
                        colSpan={9}
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
                              <TableCell colSpan={9} className="p-4 sm:p-5">
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
                                          setRecordDate(`${row.yearMonth}-01`);
                                          setAddRecordOpen(true);
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

        {/* TAB 2: Monthly P&L / Statement View (Vertical layout, unlimited categories) */}
        <TabsContent value="statement" className="mt-2 flex flex-col gap-4">
          {/* Month Selector Bar */}
          <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border border-slate-200 shadow-2xs rounded-xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold text-slate-700">
                เลือกเดือนที่ต้องการดูงบ:
              </span>
              <Select value={statementMonth} onValueChange={setStatementMonth}>
                <SelectTrigger className="h-9 w-fit min-w-[210px] rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold shadow-2xs hover:bg-slate-50 focus-visible:ring-1 focus-visible:ring-[#fe2c55]">
                  <SelectValue placeholder="เลือกเดือน" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                  {rows.map((r) => (
                    <SelectItem
                      key={r.yearMonth}
                      value={r.yearMonth}
                      className="text-xs font-medium cursor-pointer"
                    >
                      {formatThaiYearMonth(r.yearMonth)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {statementRow && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs"
                  onClick={() => handleOpenPrint(statementRow.yearMonth)}
                >
                  <PrinterIcon className="size-3.5 text-[#fe2c55]" />
                  พิมพ์รายงานประจำเดือน
                </Button>

                <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                  <span className="text-xs font-medium text-slate-500">
                    กำไรคงเหลือสุทธิ:
                  </span>
                  <span
                    className={cn(
                      "font-mono text-base font-bold",
                      statementRow.netRemaining >= 0
                        ? "text-emerald-600"
                        : "text-rose-600",
                    )}
                  >
                    {formatTHB(statementRow.netRemaining)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {statementRow ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Box 1: Platform Inflows */}
              <Card className="flex flex-col gap-3 p-5 border border-slate-200 bg-white shadow-2xs rounded-xl">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <WalletIcon className="size-5 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      1. รายรับจากแพลตฟอร์ม (Platform Payout)
                    </h3>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs bg-slate-50 text-slate-700 border-slate-200">
                    {statementRow.orderCount.toLocaleString()} ออเดอร์
                  </Badge>
                </div>

                <div className="flex flex-col gap-2.5 py-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">TikTok Shop (เงินโอนสุทธิ)</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatTHB(statementRow.tiktokPayout)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Shopee (ยอดขายหักค่าส่ง)</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatTHB(statementRow.shopeePayout)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Facebook (ยอดขายหักค่าส่ง)</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatTHB(statementRow.facebookPayout)}
                    </span>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-xs font-bold text-slate-900">
                    รวมรายรับจากทุกแพลตฟอร์ม
                  </span>
                  <span className="font-mono text-base font-bold text-slate-900">
                    {formatTHB(statementRow.totalPlatformPayout)}
                  </span>
                </div>
              </Card>

              {/* Box 2: Company Expenses (Vertical list - unlimited items!) */}
              <Card className="flex flex-col gap-3 p-5 border border-slate-200 bg-white shadow-2xs rounded-xl">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingDownIcon className="size-5 text-rose-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      2. รายจ่ายบริษัท (Company Expenses)
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7.5 gap-1 px-2.5 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs"
                    onClick={() => setAddCategoryOpen(true)}
                  >
                    <PlusIcon className="size-3 text-[#fe2c55]" />
                    เพิ่มหมวด
                  </Button>
                </div>

                {categories.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <p className="text-xs font-medium text-slate-500">
                      ยังไม่มีหมวดหมู่รายจ่ายในระบบ
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7.5 gap-1 px-3 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-2xs"
                      onClick={() => setAddCategoryOpen(true)}
                    >
                      <PlusIcon className="size-3.5" />
                      เพิ่มหมวดหมู่แรก
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
                    {categories.map((cat) => {
                      const amt = statementRow.categoryAmounts[cat.id] ?? 0;
                      const direct = statementRow.directAmounts[cat.id] ?? 0;
                      const count = statementRow.categoryItemCounts[cat.id] ?? 0;

                      return (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/90 bg-[#f8fafc] hover:bg-white p-2.5 text-xs transition-colors"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-800">
                              {cat.name}
                            </span>
                            {count > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenMonthDetail(statementRow.yearMonth, cat)}
                                className="text-left text-[11px] font-semibold text-[#fe2c55] underline"
                              >
                                {count} รายการย่อย
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-rose-600">
                              {amt > 0 ? formatTHB(amt) : "-"}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                              onClick={() => {
                                setEditingCell({
                                  yearMonth: statementRow.yearMonth,
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
                              <Edit2Icon className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-xs font-bold text-rose-700">
                    รวมรายจ่ายบริษัททั้งหมด
                  </span>
                  <span className="font-mono text-base font-bold text-rose-700">
                    {formatTHB(statementRow.totalExpenses)}
                  </span>
                </div>
              </Card>

              {/* Bottom Summary Bar for selected month */}
              <Card className="col-span-1 md:col-span-2 flex flex-wrap items-center justify-between gap-4 p-5 border-2 border-rose-200 bg-rose-50/20 shadow-2xs rounded-xl">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700">
                    สรุปผลกำไรสุทธิประจำเดือน {formatThaiYearMonth(statementRow.yearMonth)}
                  </span>
                  <p className="text-xs text-slate-600">
                    รายรับ <strong>{formatTHB(statementRow.totalPlatformPayout)}</strong> หักรายจ่าย{" "}
                    <strong>{formatTHB(statementRow.totalExpenses)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-medium text-slate-500">อัตรากำไร</span>
                    <span className="font-mono text-sm font-bold text-slate-800">
                      {statementRow.profitMarginPercent !== null
                        ? `${statementRow.profitMarginPercent.toFixed(1)}%`
                        : "-"}
                    </span>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-700">กำไรคงเหลือสุทธิ</span>
                    <span
                      className={cn(
                        "font-mono text-2xl font-black",
                        statementRow.netRemaining >= 0
                          ? "text-emerald-600"
                          : "text-rose-600",
                      )}
                    >
                      {formatTHB(statementRow.netRemaining)}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-8 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-xl">
              กรุณาเลือกเดือนเพื่อดูงบการเงิน
            </Card>
          )}
        </TabsContent>

        {/* TAB 3: Category Management Tab */}
        <TabsContent value="categories" className="mt-2 flex flex-col gap-3">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-slate-200 shadow-2xs rounded-xl">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-bold text-slate-900">
                หมวดหมู่รายจ่ายทั้งหมด ({categories.length})
              </h3>
              <p className="text-xs text-slate-500">
                เพิ่ม แก้ไขชื่อ หรือลบหมวดหมู่รายจ่ายของคุณได้ที่นี่อย่างอิสระ
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              className="gap-1.5 text-xs font-bold bg-[#fe2c55] hover:bg-[#e0264b] text-white shadow-xs rounded-lg"
              onClick={() => setAddCategoryOpen(true)}
            >
              <PlusIcon className="size-4" />
              เพิ่มหมวดหมู่ใหม่
            </Button>
          </Card>

          <Card className="overflow-hidden border border-slate-200 bg-white shadow-2xs rounded-xl">
            {categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-[#fe2c55]">
                  <FolderPlusIcon className="size-6 stroke-[1.75]" />
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <p className="text-sm font-bold text-slate-800">
                    ยังไม่มีหมวดหมู่รายจ่าย
                  </p>
                  <p className="text-xs text-slate-500">
                    เพิ่มหมวดหมู่รายจ่ายแรกเพื่อเริ่มต้นจัดระเบียบค่าใช้จ่ายของบริษัท
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
              <Table className="text-xs">
                <TableHeader sticky={false} className="bg-[#f8fafc] border-b border-slate-200">
                  <TableRow>
                    <TableHead sticky={false} className="w-12 text-center font-bold text-slate-700">#</TableHead>
                    <TableHead sticky={false} className="font-bold text-slate-800">ชื่อหมวดหมู่</TableHead>
                    <TableHead sticky={false} className="w-36 text-center font-bold text-slate-700">การจัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat, idx) => (
                    <TableRow key={cat.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <TableCell className="text-center font-mono text-slate-500">
                        {idx + 1}
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
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Add Category */}
      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-slate-900 font-bold">เพิ่มหมวดหมู่รายจ่ายใหม่</DialogTitle>
            <DialogDescription className="text-slate-500">
              สร้างหมวดหมู่รายจ่ายตามที่คุณต้องการ เช่น ค่าแอดโฆษณา, ค่าเช่าสำนักงาน,
              เงินเดือน, ค่าแพ็คเกจจิ้ง
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddCategory} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
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
                placeholder="เช่น ค่าโฆษณา / ค่าแอด, ค่าเช่าสำนักงาน"
                className="h-10 text-sm border-slate-200 focus-visible:ring-[#fe2c55]"
                autoFocus
                required
              />
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
            <DialogTitle className="text-slate-900 font-bold">แก้ไขชื่อหมวดหมู่รายจ่าย</DialogTitle>
            <DialogDescription className="text-slate-500">เปลี่ยนชื่อหมวดหมู่รายจ่ายในระบบ</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditCategory} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
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

      {/* Dialog: Add Itemized Record */}
      <Dialog open={addRecordOpen} onOpenChange={setAddRecordOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl">
          <DialogHeader className="pr-11">
            <DialogTitle className="text-slate-900 font-bold">บันทึกรายการรายจ่ายย่อย</DialogTitle>
            <DialogDescription className="text-slate-500">
              บันทึกรายการรายจ่ายพร้อมระบุวันที่ รายละเอียด และยอดเงิน
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddRecord} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="record-date"
                  className="text-xs font-bold text-slate-700"
                >
                  วันที่จ่าย <span className="text-[#fe2c55]">*</span>
                </label>
                <Input
                  id="record-date"
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  className="h-9 text-xs border-slate-200"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="record-category"
                  className="text-xs font-bold text-slate-700"
                >
                  หมวดหมู่ <span className="text-[#fe2c55]">*</span>
                </label>
                <Select
                  value={String(recordCategoryId || categories[0]?.id || "")}
                  onValueChange={(val) => setRecordCategoryId(Number(val))}
                >
                  <SelectTrigger
                    id="record-category"
                    className="h-9 w-full rounded-lg border-slate-200 bg-white px-3 text-xs font-medium shadow-2xs hover:bg-slate-50 focus-visible:ring-1 focus-visible:ring-[#fe2c55]"
                  >
                    <SelectValue placeholder="เลือกหมวดหมู่รายจ่าย" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-lg z-50">
                    {categories.map((cat) => (
                      <SelectItem
                        key={cat.id}
                        value={String(cat.id)}
                        className="text-xs font-medium cursor-pointer"
                      >
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="record-amount"
                className="text-xs font-bold text-slate-700"
              >
                ยอดเงิน (บาท) <span className="text-[#fe2c55]">*</span>
              </label>
              <Input
                id="record-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={recordAmount}
                onChange={(e) => setRecordAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 text-base font-bold border-slate-200 focus-visible:ring-[#fe2c55]"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="record-title"
                className="text-xs font-bold text-slate-700"
              >
                ชื่อรายการ / รายละเอียด <span className="text-[#fe2c55]">*</span>
              </label>
              <Input
                id="record-title"
                type="text"
                value={recordTitle}
                onChange={(e) => setRecordTitle(e.target.value)}
                placeholder="เช่น บูสต์โพสต์ TikTok แคมเปญ 10.10, ค่าเช่าโกดัง"
                className="h-9 text-xs border-slate-200"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="record-note"
                className="text-xs font-medium text-slate-500"
              >
                หมายเหตุเพิ่มเติม
              </label>
              <Input
                id="record-note"
                type="text"
                value={recordNote}
                onChange={(e) => setRecordNote(e.target.value)}
                placeholder="เช่น เลขที่บิล/ใบเสร็จ หรือหมายเหตุอื่น"
                className="h-9 text-xs border-slate-200"
              />
            </div>

            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setAddRecordOpen(false)}
                disabled={savingRecord}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                className="h-9 px-4 text-xs font-bold rounded-lg bg-[#fe2c55] hover:bg-[#e0264b] text-white"
                disabled={savingRecord}
              >
                {savingRecord ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  "บันทึกรายการ"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                if (sheetYearMonth) {
                  setRecordDate(`${sheetYearMonth}-01`);
                }
                if (sheetCategoryId) {
                  setRecordCategoryId(sheetCategoryId);
                }
                setAddRecordOpen(true);
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
                    รายงานงบการเงินรายเดือน (P&L)
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
                  ส่วนที่ 1: รายรับสุทธิจากช่องทางจำหน่าย (Platform Net Revenue)
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
                    <tr>
                      <td className="border border-slate-300 p-2 text-center font-mono">1</td>
                      <td className="border border-slate-300 p-2 font-bold text-slate-900">TikTok Shop</td>
                      <td className="border border-slate-300 p-2 text-slate-600">ยอดเงินโอนสุทธิตามรายงาน Settlement (หักค่าธรรมเนียม/ค่าส่ง)</td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                        {formatTHB(printRow.tiktokPayout)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 text-center font-mono">2</td>
                      <td className="border border-slate-300 p-2 font-bold text-slate-900">Shopee</td>
                      <td className="border border-slate-300 p-2 text-slate-600">ยอดรับเงินสดสุทธิตามบิลขายจริง (ยอดขายหักค่าส่งที่ร้านจ่าย)</td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                        {formatTHB(printRow.shopeePayout)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 text-center font-mono">3</td>
                      <td className="border border-slate-300 p-2 font-bold text-slate-900">Facebook</td>
                      <td className="border border-slate-300 p-2 text-slate-600">ยอดรับเงินสดสุทธิตามบิลขายจริง (ยอดขายหักค่าส่งที่ร้านจ่าย)</td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">
                        {formatTHB(printRow.facebookPayout)}
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/70 font-bold">
                      <td colSpan={3} className="border border-slate-300 p-2.5 text-right text-emerald-950 font-extrabold">
                        รวมรายรับจากทุกช่องทางจำหน่าย (A)
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
                  ส่วนที่ 2: รายจ่ายบริษัทจำแนกตามหมวดหมู่ (Company Expenses by Category)
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
                        รวมรายจ่ายบริษัททั้งหมด (B)
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
                      รวมรายรับจากแพลตฟอร์ม (A)
                    </span>
                    <span className="font-mono text-base font-bold text-slate-900">
                      {formatTHB(printRow.totalPlatformPayout)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                      หัก รวมรายจ่ายบริษัท (B)
                    </span>
                    <span className="font-mono text-base font-bold text-rose-700">
                      {formatTHB(printRow.totalExpenses)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:border-l sm:border-slate-300 sm:pl-4 print:border-l print:border-slate-300 print:pl-4">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      กำไรคงเหลือสุทธิ (A - B)
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
