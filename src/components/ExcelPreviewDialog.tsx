"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
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
import { Input } from "@/components/ui/input";
import type { ImportSpreadsheetData } from "@/lib/queries";
import { cn } from "@/lib/utils";

function colIndexToLetter(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function formatCellText(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    return Number.isInteger(val)
      ? val.toString()
      : val.toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 4,
        });
  }
  return String(val);
}

const PAGE_SIZE = 100;

export function ExcelSpreadsheetViewer({
  data,
  className,
}: {
  data: ImportSpreadsheetData;
  className?: string;
}) {
  const [sheetIdx, setSheetIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCell, setSelectedCell] = useState<{
    rowIdx: number;
    colIdx: number;
  }>({ rowIdx: 0, colIdx: 0 });
  const [copied, setCopied] = useState(false);

  const activeSheet = data.sheets[sheetIdx] ?? data.sheets[0];

  useEffect(() => {
    setPage(1);
    setSelectedCell({
      rowIdx: activeSheet?.headerRowIndex ?? 0,
      colIdx: 0,
    });
  }, [sheetIdx, activeSheet?.headerRowIndex]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const colCount = useMemo(() => {
    if (!activeSheet) return 1;
    let max = activeSheet.headers.length;
    for (const r of activeSheet.rows) {
      if (r.length > max) max = r.length;
    }
    return Math.max(1, max);
  }, [activeSheet]);

  const indexedRows = useMemo(() => {
    if (!activeSheet) return [];
    const q = search.trim().toLowerCase();
    const all = activeSheet.rows.map((cells, idx) => ({
      excelRowNumber: idx + 1,
      rowIdx: idx,
      isHeader: idx === activeSheet.headerRowIndex,
      cells,
    }));
    if (!q) return all;
    return all.filter(
      (item) =>
        item.isHeader ||
        item.cells.some((c) =>
          c !== null && c !== undefined && String(c).toLowerCase().includes(q),
        ),
    );
  }, [activeSheet, search]);

  const pageCount = Math.max(1, Math.ceil(indexedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return indexedRows.slice(start, start + PAGE_SIZE);
  }, [indexedRows, safePage]);

  const selectedCoord = `${colIndexToLetter(selectedCell.colIdx)}${selectedCell.rowIdx + 1}`;
  const selectedRawValue =
    activeSheet?.rows[selectedCell.rowIdx]?.[selectedCell.colIdx] ?? null;
  const selectedText =
    selectedRawValue === null || selectedRawValue === undefined
      ? ""
      : String(selectedRawValue);
  const selectedColHeader =
    activeSheet?.headers[selectedCell.colIdx] ||
    `คอลัมน์ ${colIndexToLetter(selectedCell.colIdx)}`;

  async function handleCopyCell() {
    if (!selectedText) return;
    try {
      await navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard error
    }
  }

  if (!activeSheet) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        ไม่พบข้อมูลตารางในไฟล์นี้
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-white",
        className,
      )}
    >
      {/* Top Excel Toolbar: Search + Sheet Info + Download */}
      <div className="shrink-0 border-b border-[#cbd5e1] bg-[#f8fafc] px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาคำหรือตัวเลขในชีตนี้..."
              aria-label="ค้นหาข้อมูลในตาราง Excel"
              className="h-10 bg-white pr-9 pl-9 text-xs sm:text-sm"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="ล้างคำค้นหา"
                className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                data.sourceMode === "original_file" ? "success" : "secondary"
              }
              size="sm"
            >
              {data.sourceMode === "original_file"
                ? "ไฟล์ต้นฉบับ 100%"
                : "ตารางข้อมูลที่นำเข้า"}
            </Badge>
            <span className="text-xs font-medium text-[#475569]">
              ทั้งหมด{" "}
              <strong className="text-[#0f172a]">
                {activeSheet.totalRows.toLocaleString("th-TH")}
              </strong>{" "}
              แถว ·{" "}
              <strong className="text-[#0f172a]">{colCount}</strong> คอลัมน์
            </span>
            <Button asChild variant="outline" size="xs">
              <a
                href={`/api/imports/${data.importId}?mode=download`}
                download
              >
                <DownloadIcon className="size-3.5" />
                ดาวน์โหลด Excel
              </a>
            </Button>
          </div>
        </div>

        {/* Excel Formula / Cell Inspector Bar */}
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-2 py-1 text-xs shadow-2xs">
          <span
            className="inline-flex min-w-[46px] shrink-0 items-center justify-center rounded bg-[#f1f5f9] px-2 py-1 font-mono text-[11.5px] font-bold text-[#0f172a] border border-[#e2e8f0]"
            title="พิกัดเซลล์ที่เลือก"
          >
            {selectedCoord}
          </span>
          <span
            className="hidden max-w-[180px] shrink-0 truncate border-r border-[#e2e8f0] pr-2 text-[11px] font-semibold text-[#64748b] sm:inline-block"
            title={selectedColHeader}
          >
            {selectedColHeader}
          </span>
          <span className="shrink-0 px-1 font-mono text-xs font-bold text-[#94a3b8] select-none">
            fx
          </span>
          <div className="min-w-0 flex-1 truncate font-mono text-xs text-[#0f172a]">
            {selectedText || (
              <span className="font-sans italic text-[#94a3b8]">
                (คลิกเลือกเซลล์ในตารางเพื่อดูค่าเต็มหรือคัดลอก)
              </span>
            )}
          </div>
          {selectedText ? (
            <button
              type="button"
              onClick={handleCopyCell}
              aria-label="คัดลอกค่าในเซลล์"
              className="inline-flex min-h-[30px] shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-[#334155] hover:bg-[#f1f5f9]"
            >
              {copied ? (
                <>
                  <CheckIcon className="size-3 text-[#059669]" />
                  <span className="text-[#059669]">คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <CopyIcon className="size-3" />
                  <span>คัดลอก</span>
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Excel Grid Area */}
      <div className="relative min-h-0 flex-1 overflow-auto bg-[#e2e8f0]/50">
        <table className="w-max min-w-full border-collapse bg-white text-[12.5px] leading-snug">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#f1f5f9] text-[#475569]">
              <th className="sticky left-0 z-30 w-12 min-w-[48px] border-r border-b border-[#cbd5e1] bg-[#e2e8f0] px-2 py-1.5 text-center font-mono text-[11px] font-bold text-[#475569] select-none">
                #
              </th>
              {Array.from({ length: colCount }, (_, colIdx) => {
                const isSelectedCol = selectedCell.colIdx === colIdx;
                const colHeader = activeSheet.headers[colIdx] ?? "";
                return (
                  <th
                    key={colIdx}
                    className={cn(
                      "min-w-[120px] max-w-[300px] border-r border-b border-[#cbd5e1] px-2.5 py-1.5 text-center font-mono text-[11px] font-bold select-none transition-colors",
                      isSelectedCol
                        ? "bg-[#dbeafe] text-[#1d4ed8]"
                        : "bg-[#f1f5f9] text-[#475569]",
                    )}
                    title={colHeader || `Column ${colIndexToLetter(colIdx)}`}
                  >
                    {colIndexToLetter(colIdx)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount + 1}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  ไม่พบแถวข้อมูลที่ตรงกับคำค้นหา &ldquo;{search}&rdquo;
                </td>
              </tr>
            ) : (
              visibleRows.map((rowObj) => {
                const isSelectedRow = selectedCell.rowIdx === rowObj.rowIdx;
                return (
                  <tr
                    key={rowObj.rowIdx}
                    className={cn(
                      "group transition-colors",
                      rowObj.isHeader
                        ? "bg-[#ecfdf5]/90 font-bold text-[#065f46]"
                        : isSelectedRow
                          ? "bg-[#eff6ff]/60"
                          : "hover:bg-[#f8fafc]",
                    )}
                  >
                    {/* Sticky Row Number Column */}
                    <td
                      className={cn(
                        "sticky left-0 z-10 border-r border-b border-[#cbd5e1] px-2 py-1.5 text-center font-mono text-[11px] font-semibold select-none",
                        isSelectedRow
                          ? "bg-[#dbeafe] font-bold text-[#1d4ed8]"
                          : rowObj.isHeader
                            ? "bg-[#d1fae5] font-bold text-[#065f46]"
                            : "bg-[#f8fafc] text-[#64748b]",
                      )}
                    >
                      {rowObj.excelRowNumber}
                    </td>

                    {Array.from({ length: colCount }, (_, colIdx) => {
                      const val = rowObj.cells[colIdx] ?? null;
                      const isNumeric = typeof val === "number";
                      const isSelected =
                        selectedCell.rowIdx === rowObj.rowIdx &&
                        selectedCell.colIdx === colIdx;
                      const formatted = formatCellText(val);

                      return (
                        <td
                          key={colIdx}
                          onClick={() =>
                            setSelectedCell({
                              rowIdx: rowObj.rowIdx,
                              colIdx,
                            })
                          }
                          title={formatted || undefined}
                          className={cn(
                            "max-w-[320px] cursor-cell truncate border-r border-b border-[#e2e8f0] px-2.5 py-1.5 align-middle",
                            isNumeric && !rowObj.isHeader
                              ? "text-right font-mono tabular-nums"
                              : "text-left",
                            rowObj.isHeader &&
                              "border-b-[#94a3b8] bg-[#f0fdf4] font-bold text-[#0f172a]",
                            isSelected &&
                              "z-10 outline-2 -outline-offset-2 outline-[#2563eb] bg-[#eff6ff]",
                          )}
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Excel Sheet Tabs + Row Pagination Bar */}
      <div className="shrink-0 border-t border-[#cbd5e1] bg-[#f1f5f9] px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Sheet Tabs (like bottom of Excel) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {data.sheets.map((sheet, idx) => {
              const active = idx === sheetIdx;
              return (
                <button
                  key={`${sheet.name}-${idx}`}
                  type="button"
                  onClick={() => setSheetIdx(idx)}
                  className={cn(
                    "inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                    active
                      ? "border-[#059669] bg-white text-[#059669] shadow-xs"
                      : "border-transparent bg-[#e2e8f0]/70 text-[#475569] hover:bg-white/80 hover:text-[#0f172a]",
                  )}
                >
                  <FileSpreadsheetIcon className="size-3.5 shrink-0" />
                  <span>{sheet.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10.5px]",
                      active
                        ? "bg-[#ecfdf5] text-[#059669]"
                        : "bg-[#cbd5e1]/60 text-[#475569]",
                    )}
                  >
                    {sheet.totalRows.toLocaleString("th-TH")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Row Pagination Controls */}
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <span>
              แสดงแถว{" "}
              <strong>
                {indexedRows.length === 0
                  ? 0
                  : ((safePage - 1) * PAGE_SIZE + 1).toLocaleString("th-TH")}
                –
                {Math.min(
                  indexedRows.length,
                  safePage * PAGE_SIZE,
                ).toLocaleString("th-TH")}
              </strong>{" "}
              จาก <strong>{indexedRows.length.toLocaleString("th-TH")}</strong>
            </span>
            {pageCount > 1 ? (
              <div className="inline-flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="หน้าก่อนหน้า"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <span className="px-2 font-semibold text-[#0f172a]">
                  หน้า {safePage} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-label="หน้าถัดไป"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExcelFilePreviewDialog({
  importId,
  filename,
  fileType,
  rowCount,
  triggerVariant = "button",
  triggerLabel,
  className,
}: {
  importId: number;
  filename: string;
  fileType?: string;
  rowCount?: number;
  triggerVariant?: "button" | "filename" | "secondary";
  triggerLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ImportSpreadsheetData | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (data) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/imports/${importId}?mode=preview`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "ไม่สามารถเปิดอ่านข้อมูลไฟล์นี้ได้");
      }
      const json = (await res.json()) as ImportSpreadsheetData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอ่านไฟล์");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {triggerVariant === "filename" ? (
        <button
          type="button"
          onClick={handleOpen}
          title="คลิกเพื่อเปิดอ่านข้อมูลตาราง Excel"
          className={cn(
            "file-link inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left hover:text-primary",
            className,
          )}
        >
          <FileSpreadsheetIcon className="size-4 shrink-0 text-[#059669]" />
          <span className="break-all whitespace-normal">{filename}</span>
        </button>
      ) : (
        <Button
          type="button"
          variant={triggerVariant === "secondary" ? "secondary" : "outline"}
          size="xs"
          onClick={handleOpen}
          className={cn(
            "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46] hover:border-[#6ee7b7] hover:bg-[#d1fae5]",
            className,
          )}
        >
          <FileSpreadsheetIcon className="size-3.5 text-[#059669]" />
          <span>{triggerLabel ?? "เปิดอ่าน Excel"}</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[calc(100%-1rem)] max-w-[1600px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]">
          <DialogHeader className="shrink-0 border-b border-border bg-[#0f172a] px-4 py-3 pr-14 text-left text-white sm:px-5 sm:py-3.5 sm:pr-14">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-white sm:text-base">
                  <FileSpreadsheetIcon className="size-5 shrink-0 text-[#34d399]" />
                  <span className="break-all">{filename}</span>
                  <Badge
                    variant={
                      fileType === "oms_orders"
                        ? "info"
                        : fileType === "oms_items"
                          ? "warning"
                          : "default"
                    }
                    size="sm"
                  >
                    {fileType === "oms_orders"
                      ? "1. ออเดอร์ใน shipnity"
                      : fileType === "oms_items"
                        ? "3. สินค้าในออเดอร์ shipnity"
                        : "2. รายได้ TikTok"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-slate-300">
                  ตารางอ่านข้อมูลไฟล์นำเข้าแบบ Excel (Spreadsheet Viewer)
                  {rowCount !== undefined
                    ? ` · ${rowCount.toLocaleString("th-TH")} แถวข้อมูล`
                    : ""}
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button asChild variant="outline-light" size="xs">
                  <Link href={`/import/${importId}`} onClick={() => setOpen(false)}>
                    ดูรายงานการจับคู่ / ลบไฟล์
                  </Link>
                </Button>
              </div>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#f8fafc] p-8 text-sm text-muted-foreground">
              <Loader2Icon className="size-7 animate-spin text-[#059669]" />
              <span>กำลังเปิดอ่านตารางข้อมูลจากไฟล์ {filename}...</span>
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#f8fafc] p-8 text-center">
              <p className="text-sm font-semibold text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={handleOpen}>
                ลองใหม่อีกครั้ง
              </Button>
            </div>
          ) : data ? (
            <ExcelSpreadsheetViewer data={data} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
