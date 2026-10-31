"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ColumnMappingRules,
  UnknownColumnCategory,
} from "@/lib/column-mapping-settings";
import type { UnknownColumn } from "@/lib/ingest/parse";

const CATEGORY_OPTIONS: {
  value: UnknownColumnCategory | "";
  label: string;
  badgeLabel: string;
  badgeVariant: "secondary" | "success" | "warning" | "info" | "outline";
}[] = [
  {
    value: "",
    label: "— ยังไม่จัดหมวด (แจ้งเตือนคอลัมน์ใหม่) —",
    badgeLabel: "ยังไม่จัดหมวด",
    badgeVariant: "warning",
  },
  {
    value: "income",
    label: "หมวดรายได้ (นำไปรวมตรวจสูตรรายได้)",
    badgeLabel: "หมวดรายได้",
    badgeVariant: "success",
  },
  {
    value: "fee",
    label: "หมวดค่าธรรมเนียม (นำไปรวมตรวจสูตรค่าธรรมเนียม)",
    badgeLabel: "หมวดค่าธรรมเนียม",
    badgeVariant: "info",
  },
  {
    value: "adjustment",
    label: "หมวดรายการปรับปรุง (นำไปรวมตรวจสูตรยอดรับสุทธิ)",
    badgeLabel: "หมวดรายการปรับปรุง",
    badgeVariant: "secondary",
  },
  {
    value: "ignore",
    label: "ข้อมูลทั่วไป / ไม่นำมาคำนวณเงิน",
    badgeLabel: "ไม่คิดเงิน",
    badgeVariant: "outline",
  },
];

function getCategoryMeta(cat?: UnknownColumnCategory | "") {
  return (
    CATEGORY_OPTIONS.find((opt) => opt.value === (cat ?? "")) ??
    CATEGORY_OPTIONS[0]!
  );
}

interface UnknownColumnsManagerProps {
  importId: number;
  unknownColumns: UnknownColumn[];
  initialRules: ColumnMappingRules;
  readOnly?: boolean;
}

export function UnknownColumnsManager({
  importId,
  unknownColumns,
  initialRules,
  readOnly = false,
}: UnknownColumnsManagerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // ระบุ "ปุ่มที่กำลังทำงาน" เพื่อให้ spinner ขึ้นเฉพาะปุ่มที่ถูกกด (ปุ่มอื่นแค่ disabled)
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [categories, setCategories] = useState<
    Record<string, UnknownColumnCategory | "">
  >(() => {
    const initial: Record<string, UnknownColumnCategory | ""> = {
      ...initialRules.unknownColumnCategories,
    };
    for (const col of unknownColumns) {
      if (col.category && !initial[col.header]) {
        initial[col.header] = col.category;
      }
    }
    return initial;
  });
  const [savedHeaderRules, setSavedHeaderRules] = useState<
    Record<string, string>
  >(initialRules.headerToFieldKey);
  const [newColHeader, setNewColHeader] = useState("");
  const [newColCategory, setNewColCategory] =
    useState<UnknownColumnCategory>("fee");

  async function saveCategories(
    patchCategories: Record<string, UnknownColumnCategory | "">,
    actionKey = "save",
  ) {
    if (busy || readOnly) return;
    setBusy(true);
    setPendingKey(actionKey);
    try {
      const response = await fetch("/api/settings/column-mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unknownColumnCategories: patchCategories,
          importId,
          reapplyAll: true,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        rules?: ColumnMappingRules;
        recalculated?: { updatedImports: number; updatedTransactions: number };
      };
      if (!response.ok || !payload.ok) {
        toast.error(payload.error ?? "บันทึกหมวดหมู่คอลัมน์ไม่สำเร็จ");
        return;
      }
      if (payload.rules) {
        setCategories(payload.rules.unknownColumnCategories);
        setSavedHeaderRules(payload.rules.headerToFieldKey);
      }
      toast.success(
        `บันทึกหมวดหมู่คอลัมน์และคำนวณยอดบิลใหม่สำเร็จ (${payload.recalculated?.updatedTransactions ?? 0} รายการ)`,
      );
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
      setPendingKey(null);
    }
  }

  async function handleAddCustomCategoryRule() {
    const trimmed = newColHeader.trim();
    if (!trimmed) {
      toast.error("กรุณากรอกชื่อคอลัมน์ที่ต้องการตั้งค่า");
      return;
    }
    const next = {
      ...categories,
      [trimmed]: newColCategory,
    };
    setCategories(next);
    setNewColHeader("");
    await saveCategories(next, "add");
  }

  async function handleRemoveHeaderRule(header: string) {
    if (busy || readOnly) return;
    setBusy(true);
    setPendingKey(`header:${header}`);
    try {
      const response = await fetch(
        `/api/settings/column-mappings?header=${encodeURIComponent(header)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        rules?: ColumnMappingRules;
      };
      if (response.ok && payload.rules) {
        setSavedHeaderRules(payload.rules.headerToFieldKey);
        toast.success(`ลบการจับคู่คอลัมน์ "${header}" แล้ว`);
        router.refresh();
      }
    } finally {
      setBusy(false);
      setPendingKey(null);
    }
  }

  async function handleRemoveCategoryRule(header: string) {
    const next = { ...categories, [header]: "" as const };
    setCategories(next);
    await saveCategories(next, `category:${header}`);
  }

  const extraSavedCategoryHeaders = Object.keys(categories).filter(
    (h) =>
      categories[h] &&
      !unknownColumns.some((col) => col.header.trim() === h.trim()),
  );
  const savedHeaderEntries = Object.entries(savedHeaderRules);

  return (
    <div className="space-y-4">
      <Card>
        <div className="section-head flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2>คอลัมน์ใหม่ที่ยังไม่รู้จัก ({unknownColumns.length})</h2>
            <p className="muted">
              หาก TikTok เพิ่มคอลัมน์รายได้/ค่าธรรมเนียม/ปรับปรุงใหม่ สามารถเลือกหมวดหมู่ด้านล่างเพื่อรวมเข้าสูตรตรวจยอดบิลได้ทันทีโดยไม่ต้องแก้โค้ด
            </p>
          </div>
          {unknownColumns.length > 0 && !readOnly ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              loading={pendingKey === "save"}
              disabled={busy}
              onClick={() => saveCategories(categories)}
            >
              {pendingKey === "save"
                ? "กำลังบันทึกและคำนวณใหม่..."
                : "บันทึกหมวดหมู่และคำนวณยอดใหม่ทันที"}
            </Button>
          ) : null}
        </div>

        {unknownColumns.length === 0 ? (
          <div className="empty-inline text-center text-balance">
            ไม่มีคอลัมน์แปลกใหม่ในไฟล์นี้ – ทุกคอลัมน์ถูกจับคู่เรียบร้อย
          </div>
        ) : (
          <Table variant="stack" className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>ชื่อคอลัมน์ในไฟล์</TableHead>
                <TableHead className="num min-[768px]:max-[1099px]:hidden">
                  แถวที่มีข้อมูล
                </TableHead>
                <TableHead className="num min-[768px]:max-[1099px]:hidden">
                  แถวที่เป็นตัวเลข ≠ 0
                </TableHead>
                <TableHead className="min-[768px]:max-[959px]:hidden">
                  ตัวอย่างค่า
                </TableHead>
                <TableHead>หมวดหมู่การคำนวณเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unknownColumns.map((column) => {
                const currentVal = categories[column.header] ?? "";
                const meta = getCategoryMeta(currentVal);
                return (
                  <TableRow key={column.col}>
                    <TableCell data-label="ลำดับคอลัมน์" className="mono">
                      {column.col + 1}
                    </TableCell>
                    <TableCell data-label="ชื่อคอลัมน์ในไฟล์">
                      <div className="flex flex-wrap items-center gap-1.5 max-[767px]:justify-end">
                        <strong>{column.header}</strong>
                        <Badge variant={meta.badgeVariant} size="sm">
                          {meta.badgeLabel}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell
                      data-label="แถวที่มีข้อมูล"
                      className="num min-[768px]:max-[1099px]:hidden"
                    >
                      {column.nonEmpty}
                    </TableCell>
                    <TableCell
                      data-label="แถวที่เป็นตัวเลข ≠ 0"
                      className="num min-[768px]:max-[1099px]:hidden"
                    >
                      {column.nonZeroNumeric}
                    </TableCell>
                    <TableCell
                      data-label="ตัวอย่างค่า"
                      className="mono muted min-[768px]:max-[959px]:hidden"
                    >
                      {column.samples.join(", ") || "-"}
                    </TableCell>
                    <TableCell data-label="หมวดหมู่การคำนวณเงิน">
                      {readOnly ? (
                        <span className="text-xs text-muted-foreground">
                          {meta.label}
                        </span>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant={currentVal ? "secondary" : "outline"}
                              size="sm"
                              disabled={busy}
                              className="w-full min-w-[190px] justify-between text-xs sm:w-60"
                            >
                              <span className="truncate">{meta.label}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-72">
                            {CATEGORY_OPTIONS.map((opt) => (
                              <DropdownMenuItem
                                key={`${column.col}-${opt.value || "none"}`}
                                onSelect={() => {
                                  const next = {
                                    ...categories,
                                    [column.header]: opt.value,
                                  };
                                  setCategories(next);
                                }}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <div className="section-head">
          <div>
            <h2>กฎจำชื่อคอลัมน์และหมวดหมู่ที่บันทึกไว้ (อัตโนมัติทุกครั้งที่นำเข้า)</h2>
            <p className="muted">
              ระบบจะใช้กฎด้านล่างจับคู่คอลัมน์ของ shipnity และจัดหมวดเงินของ TikTok อัตโนมัติในการอัปโหลดครั้งถัดไป
            </p>
          </div>
        </div>

        {!readOnly ? (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center">
            <Input
              type="text"
              value={newColHeader}
              onChange={(e) => setNewColHeader(e.target.value)}
              placeholder="พิมพ์ชื่อคอลัมน์ใหม่ของ TikTok เช่น ค่าธรรมเนียม AI พิเศษ..."
              className="flex-1 text-xs"
              aria-label="ชื่อคอลัมน์ใหม่ของ TikTok"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between text-xs sm:w-64"
                >
                  <span className="truncate">
                    {getCategoryMeta(newColCategory).label}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {CATEGORY_OPTIONS.filter((opt) => opt.value !== "").map(
                  (opt) => (
                    <DropdownMenuItem
                      key={`new-${opt.value}`}
                      onSelect={() =>
                        setNewColCategory(opt.value as UnknownColumnCategory)
                      }
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="default"
              size="sm"
              loading={pendingKey === "add"}
              disabled={busy}
              onClick={handleAddCustomCategoryRule}
            >
              {pendingKey === "add" ? "กำลังเพิ่ม..." : "+ เพิ่มหมวดหมู่คอลัมน์"}
            </Button>
          </div>
        ) : null}

        {extraSavedCategoryHeaders.length === 0 &&
        savedHeaderEntries.length === 0 ? (
          <div className="empty-inline">
            ยังไม่มีกฎจำชื่อคอลัมน์พิเศษที่บันทึกไว้ (ใช้ชื่อคอลัมน์มาตรฐานของระบบ)
          </div>
        ) : (
          <Table variant="stack" className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>ประเภทกฎ</TableHead>
                <TableHead>ชื่อคอลัมน์ในไฟล์ Excel</TableHead>
                <TableHead>การจับคู่ / หมวดหมู่ที่ตั้งไว้</TableHead>
                {!readOnly ? <TableHead className="num">จัดการ</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedHeaderEntries.map(([header, fieldKey]) => (
                <TableRow key={`hdr-${header}`}>
                  <TableCell data-label="ประเภทกฎ">
                    <Badge variant="info" size="sm">
                      จับคู่ช่องข้อมูล
                    </Badge>
                  </TableCell>
                  <TableCell data-label="ชื่อคอลัมน์ในไฟล์ Excel">
                    <strong>{header}</strong>
                  </TableCell>
                  <TableCell data-label="การจับคู่ที่ตั้งไว้" className="mono">
                    {fieldKey}
                  </TableCell>
                  {!readOnly ? (
                    <TableCell data-label="จัดการ" className="num">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={pendingKey === `header:${header}`}
                        disabled={busy}
                        onClick={() => handleRemoveHeaderRule(header)}
                      >
                        ลบ
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {extraSavedCategoryHeaders.map((header) => {
                const meta = getCategoryMeta(categories[header]);
                return (
                  <TableRow key={`cat-${header}`}>
                    <TableCell data-label="ประเภทกฎ">
                      <Badge variant={meta.badgeVariant} size="sm">
                        {meta.badgeLabel}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="ชื่อคอลัมน์ในไฟล์ Excel">
                      <strong>{header}</strong>
                    </TableCell>
                    <TableCell data-label="หมวดหมู่ที่ตั้งไว้">
                      {meta.label}
                    </TableCell>
                    {!readOnly ? (
                      <TableCell data-label="จัดการ" className="num">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          loading={pendingKey === `category:${header}`}
                          disabled={busy}
                          onClick={() => handleRemoveCategoryRule(header)}
                        >
                          ลบ
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
