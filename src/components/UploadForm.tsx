"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Progress } from "@/components/ui/progress";
import { formatDate, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExcelFilePreviewDialog } from "./ExcelPreviewDialog";
import { IconAlert, IconCheckCircle, IconFile, IconUpload } from "./icons";

interface UploadWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

interface UploadResult {
  importId: number;
  duplicate: boolean;
  filename: string;
  fileType?: "settlement" | "oms_orders" | "oms_items";
  status: "ok" | "warning";
  rowCount: number;
  orderCount: number;
  transactionCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  warnings: UploadWarning[];
  reconciliation: {
    matched: boolean | null;
    orderCheckFailures: number;
  };
}

type ProgressStage =
  | "idle"
  | "uploading"
  | "hashing"
  | "parsing"
  | "reconciling"
  | "saving"
  | "done"
  | "error";

interface UploadProgressState {
  open: boolean;
  percent: number;
  stage: ProgressStage;
  lastActiveStage: ProgressStage;
  message: string;
  filename: string;
  fileSize: number;
  current?: number;
  total?: number;
}

type StreamMessage =
  | {
      type: "progress";
      stage: "hashing" | "parsing" | "reconciling" | "saving" | "done";
      percent: number;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "result"; data: UploadResult }
  | { type: "error"; error: string; code?: string; details?: string[]; status?: number }
  | { type?: undefined; error: string; details?: string[] };

const STEP_ITEMS: { key: "upload" | "parse" | "save"; label: string }[] = [
  { key: "upload", label: "อัปโหลดไฟล์ขึ้นระบบ" },
  { key: "parse", label: "อ่านตาราง Excel & ตรวจสอบยอดรวม" },
  { key: "save", label: "สร้างบิลและบันทึกลงฐานข้อมูล" },
];

function getStepState(
  stage: ProgressStage,
  lastActiveStage: ProgressStage,
  stepKey: "upload" | "parse" | "save",
): "pending" | "active" | "done" | "error" {
  if (stage === "done") return "done";
  const targetStage = stage === "error" ? lastActiveStage : stage;
  const isError = stage === "error";

  if (stepKey === "upload") {
    if (targetStage === "uploading") return isError ? "error" : "active";
    if (
      targetStage === "hashing" ||
      targetStage === "parsing" ||
      targetStage === "reconciling" ||
      targetStage === "saving"
    ) {
      return "done";
    }
    return isError ? "error" : "pending";
  }
  if (stepKey === "parse") {
    if (
      targetStage === "hashing" ||
      targetStage === "parsing" ||
      targetStage === "reconciling"
    ) {
      return isError ? "error" : "active";
    }
    if (targetStage === "saving") return "done";
    return "pending";
  }
  if (stepKey === "save") {
    if (targetStage === "saving") return isError ? "error" : "active";
    return "pending";
  }
  return "pending";
}

const CUSTOM_MAPPING_FIELDS: { key: string; label: string }[] = [
  { key: "orderCode", label: "[shipnity] เลขที่ออเดอร์ / รหัสคำสั่งซื้อ (จำเป็น)" },
  { key: "skuCode", label: "[shipnity] รหัสสินค้า (SKU)" },
  { key: "productName", label: "[shipnity] ชื่อสินค้า" },
  { key: "unitPrice", label: "[shipnity] ราคาต่อชิ้น" },
  { key: "quantity", label: "[shipnity] จำนวนชิ้น" },
  { key: "salesAmount", label: "[shipnity] ยอดขายรวมออเดอร์" },
  { key: "discountTotal", label: "[shipnity] ส่วนลดรวม" },
  { key: "shippingFeeCustomer", label: "[shipnity] ค่าส่งที่เก็บลูกค้า" },
  { key: "channel", label: "[shipnity] ช่องทางจำหน่าย (TikTok)" },
  { key: "marketplaceOrderId", label: "[shipnity] เลขคำสั่งซื้อบน Marketplace" },
  { key: "customerName", label: "[shipnity] ชื่อลูกค้า" },
  { key: "customerPhone", label: "[shipnity] เบอร์โทรลูกค้า" },
  { key: "customerAddress", label: "[shipnity] ที่อยู่จัดส่ง" },
  { key: "postalCode", label: "[shipnity] รหัสไปรษณีย์" },
  { key: "trackingNo", label: "[shipnity] เลขพัสดุ" },
  { key: "courier", label: "[shipnity] ขนส่ง" },
  { key: "createdDate", label: "[shipnity] วันที่สั่งซื้อ / วันที่สร้าง" },
  { key: "paidDate", label: "[shipnity] วันที่โอนเงิน / ชำระเงิน" },
  { key: "orderId", label: "[TikTok รายได้] หมายเลขคำสั่งซื้อ/การปรับยอด" },
  { key: "payout", label: "[TikTok รายได้] ยอดการชำระเงินทั้งหมด (รับสุทธิ)" },
  { key: "incomeTotal", label: "[TikTok รายได้] รายได้ทั้งหมด" },
  { key: "feeTotal", label: "[TikTok รายได้] ค่าธรรมเนียมทั้งหมด" },
  { key: "adjustment", label: "[TikTok รายได้] การปรับยอด" },
  { key: "productAfterDiscount", label: "[TikTok รายได้] ยอดรวมค่าสินค้าหลังหักส่วนลด" },
  { key: "transactionType", label: "[TikTok รายได้] ประเภทธุรกรรม" },
  { key: "paidAt", label: "[TikTok รายได้] เวลาที่ชำระเงินสำเร็จ" },
  { key: "createdAt", label: "[TikTok รายได้] เวลาที่สร้างคำสั่งซื้อ" },
];

export function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [batchResults, setBatchResults] = useState<UploadResult[]>([]);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [unrecognizedHeaders, setUnrecognizedHeaders] = useState<string[]>([]);
  const [fieldToHeader, setFieldToHeader] = useState<Record<string, string>>({});
  const [saveMappingForFuture, setSaveMappingForFuture] = useState(true);
  const [progress, setProgress] = useState<UploadProgressState>({
    open: false,
    percent: 0,
    stage: "idle",
    lastActiveStage: "idle",
    message: "",
    filename: "",
    fileSize: 0,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function chooseFiles(fileList: FileList | File[] | null) {
    setError(null);
    setErrorDetails([]);
    setResult(null);
    setBatchResults([]);
    if (!fileList || fileList.length === 0) {
      setFiles([]);
      return;
    }
    const nextFiles = Array.from(fileList);
    const invalid = nextFiles.find((f) => !/\.(xlsx|csv)$/i.test(f.name));
    if (invalid) {
      const msg = "รองรับเฉพาะไฟล์ .xlsx หรือ .csv เท่านั้น";
      setError(msg);
      toast.error(msg);
      setFiles([]);
      return;
    }
    setFiles(nextFiles);
  }

  async function uploadSingleFile(
    targetFile: File,
    fileIndex: number,
    totalFiles: number,
    customMap?: Record<string, string>,
  ): Promise<
    | { ok: true; data: UploadResult }
    | { ok: false; error: string; code?: string; details?: string[] }
  > {
    const prefix = totalFiles > 1 ? `[ไฟล์ ${fileIndex + 1}/${totalFiles}] ` : "";
    setProgress({
      open: true,
      percent: 1,
      stage: "uploading",
      lastActiveStage: "uploading",
      message: `${prefix}กำลังส่งไฟล์ขึ้นเซิร์ฟเวอร์...`,
      filename: targetFile.name,
      fileSize: targetFile.size,
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/imports?stream=1", true);

      let processedIndex = 0;
      let resolved = false;

      const consumeLines = (finalChunk = false) => {
        const text = xhr.responseText ?? "";
        let newlineIndex = text.indexOf("\n", processedIndex);

        while (newlineIndex !== -1) {
          const line = text.slice(processedIndex, newlineIndex).trim();
          processedIndex = newlineIndex + 1;
          if (line) {
            handleLine(line);
          }
          newlineIndex = text.indexOf("\n", processedIndex);
        }

        if (finalChunk && processedIndex < text.length) {
          const tail = text.slice(processedIndex).trim();
          processedIndex = text.length;
          if (tail) {
            handleLine(tail);
          }
        }
      };

      const handleLine = (line: string) => {
        try {
          const msg = JSON.parse(line) as StreamMessage;
          if (msg.type === "progress") {
            const mappedPercent = Math.min(
              99,
              Math.max(30, Math.round(30 + (msg.percent / 100) * 70)),
            );
            setProgress((prev) => ({
              ...prev,
              percent: Math.max(prev.percent, mappedPercent),
              stage: msg.stage,
              lastActiveStage: msg.stage,
              message: `${prefix}${msg.message}`,
              current: msg.current,
              total: msg.total,
            }));
          } else if (msg.type === "result") {
            resolved = true;
            setProgress((prev) => ({
              ...prev,
              percent: 100,
              stage: "done",
              lastActiveStage: "done",
              message: msg.data.duplicate
                ? `${prefix}ไฟล์นี้เคยนำเข้าแล้ว ไม่ต้องบันทึกซ้ำ`
                : `${prefix}นำเข้าสำเร็จ (${msg.data.orderCount.toLocaleString("th-TH")} ออเดอร์)`,
            }));
            resolve({ ok: true, data: msg.data });
          } else if (msg.type === "error") {
            resolved = true;
            setProgress((prev) => ({
              ...prev,
              stage: "error",
              message: msg.error ?? "นำเข้าไม่สำเร็จ",
            }));
            resolve({
              ok: false,
              error: msg.error ?? "นำเข้าไม่สำเร็จ",
              code: msg.code,
              details: msg.details ?? [],
            });
          } else if (typeof msg.error === "string") {
            resolved = true;
            setProgress((prev) => ({
              ...prev,
              stage: "error",
              message: msg.error,
            }));
            resolve({
              ok: false,
              error: msg.error,
              details: msg.details ?? [],
            });
          }
        } catch {
          // ignore non-json partial line
        }
      };

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const uploadRatio = Math.min(1, event.loaded / event.total);
        const mappedPercent = Math.max(1, Math.round(uploadRatio * 30));
        const nextStage: ProgressStage = uploadRatio >= 1 ? "hashing" : "uploading";
        setProgress((prev) => ({
          ...prev,
          percent: Math.max(prev.percent, mappedPercent),
          stage: nextStage,
          lastActiveStage: nextStage,
          message:
            uploadRatio >= 1
              ? `${prefix}อัปโหลดครบแล้ว กำลังตรวจสอบไฟล์...`
              : `${prefix}กำลังส่งไฟล์ขึ้นเซิร์ฟเวอร์ (${formatFileSize(event.loaded)} / ${formatFileSize(event.total)})`,
        }));
      };

      xhr.onprogress = () => {
        consumeLines(false);
      };

      xhr.onload = () => {
        consumeLines(true);
        if (!resolved) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const parsed = JSON.parse(xhr.responseText) as UploadResult;
              setProgress((prev) => ({
                ...prev,
                percent: 100,
                stage: "done",
                message: `นำเข้าสำเร็จ (${parsed.orderCount.toLocaleString("th-TH")} ออเดอร์)`,
              }));
              resolve({ ok: true, data: parsed });
              return;
            } catch {
              // fallthrough
            }
          }
          try {
            const errPayload = JSON.parse(xhr.responseText) as {
              error?: string;
              details?: string[];
            };
            const errMsg = errPayload.error ?? "นำเข้าไม่สำเร็จ";
            setProgress((prev) => ({
              ...prev,
              stage: "error",
              message: errMsg,
            }));
            resolve({
              ok: false,
              error: errMsg,
              details: errPayload.details ?? [],
            });
          } catch {
            resolve({
              ok: false,
              error: "นำเข้าไม่สำเร็จ กรุณาตรวจสอบไฟล์แล้วลองอีกครั้ง",
            });
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error("NETWORK_ERROR"));
      };

      const body = new FormData();
      body.append("file", targetFile);
      if (customMap && Object.keys(customMap).length > 0) {
        body.append("customMapping", JSON.stringify(customMap));
        body.append("saveMapping", saveMappingForFuture ? "1" : "0");
      }
      xhr.send(body);
    });
  }

  async function uploadWithCustomMapping() {
    if (!mappingFile || busy) return;
    const headerToField: Record<string, string> = {};
    for (const [fieldKey, headerName] of Object.entries(fieldToHeader)) {
      if (headerName) headerToField[headerName] = fieldKey;
    }
    if (!headerToField || Object.keys(headerToField).length < 2) {
      toast.error("กรุณาเลือกจับคู่คอลัมน์อย่างน้อย 2 คอลัมน์");
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetails([]);
    try {
      const payload = await uploadSingleFile(mappingFile, 0, 1, headerToField);
      if (!payload.ok) {
        setError(payload.error);
        setErrorDetails(payload.details ?? []);
        toast.error(payload.error);
        return;
      }
      setMappingFile(null);
      setUnrecognizedHeaders([]);
      setFieldToHeader({});
      setResult(payload.data);
      setFiles([]);
      toast.success(
        saveMappingForFuture
          ? `นำเข้าสำเร็จ (${payload.data.orderCount} ออเดอร์) และจำชื่อคอลัมน์ไว้ใช้ครั้งถัดไปแล้ว`
          : `นำเข้าด้วย Custom Mapping สำเร็จ (${payload.data.orderCount} ออเดอร์)`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setErrorDetails([]);
    setResult(null);
    setBatchResults([]);

    try {
      const completed: UploadResult[] = [];
      let pendingMappingFile: { file: File; headers: string[] } | null = null;
      const failedMessages: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const payload = await uploadSingleFile(files[i], i, files.length);
        if (!payload.ok) {
          if (
            payload.code === "UNRECOGNIZED_HEADERS" &&
            payload.details &&
            payload.details.length > 0
          ) {
            if (!pendingMappingFile) {
              pendingMappingFile = {
                file: files[i],
                headers: payload.details,
              };
            }
            continue;
          }
          failedMessages.push(`${files[i].name}: ${payload.error}`);
          continue;
        }
        completed.push(payload.data);
      }

      if (completed.length > 0) {
        const last = completed[completed.length - 1] ?? null;
        setResult(last);
        setBatchResults(completed);
        router.refresh();
      }

      if (pendingMappingFile) {
        setProgress((prev) => ({ ...prev, open: false }));
        setMappingFile(pendingMappingFile.file);
        setUnrecognizedHeaders(pendingMappingFile.headers);
        setFieldToHeader({});
        toast.info(
          completed.length > 0
            ? `นำเข้าสำเร็จ ${completed.length} ไฟล์ · พบหัวตารางใหม่ใน ${pendingMappingFile.file.name}`
            : "พบหัวตารางรูปแบบใหม่ กรุณาเลือกจับคู่คอลัมน์",
        );
        return;
      }

      if (failedMessages.length > 0) {
        const joined = failedMessages.join(" | ");
        setError(joined);
        toast.error(joined);
        return;
      }

      const last = completed[completed.length - 1] ?? null;
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      if (completed.length > 1) {
        toast.success(`นำเข้าและแมปข้อมูลทั้ง ${completed.length} ไฟล์สำเร็จ`);
      } else if (last?.duplicate) {
        toast.info("ไฟล์นี้เคยนำเข้าแล้ว ระบบจึงไม่บันทึกซ้ำ");
      } else if (last) {
        toast.success(`นำเข้าสำเร็จ (${last.orderCount} ออเดอร์)`);
      }
    } catch {
      const msg = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง";
      setError(msg);
      setProgress((prev) => ({
        ...prev,
        stage: "error",
        message: msg,
      }));
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const isProcessing =
    busy ||
    progress.stage === "uploading" ||
    progress.stage === "hashing" ||
    progress.stage === "parsing" ||
    progress.stage === "reconciling" ||
    progress.stage === "saving";

  return (
    <div className="upload-card">
      <label
        className={cn("dropzone", dragging && "dragging", busy && "busy")}
        htmlFor="income-file"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          chooseFiles(event.dataTransfer.files);
        }}
      >
        <Input
          ref={inputRef}
          id="income-file"
          type="file"
          accept=".xlsx,.csv"
          multiple
          className="sr-only"
          aria-label="เลือกไฟล์ .xlsx หรือ .csv"
          disabled={busy}
          onChange={(event) => chooseFiles(event.target.files)}
        />
        <span className="dropzone-icon">
          <IconUpload size={26} />
        </span>
        <strong className="break-all">
          {files.length === 1
            ? files[0].name
            : files.length > 1
              ? `เลือกไว้ ${files.length} ไฟล์ (${files.map((f) => f.name).join(", ")})`
              : "ลากไฟล์ .xlsx หรือ .csv มาวาง (เลือกพร้อมกันทั้ง 3 ไฟล์ได้)"}
        </strong>
        <span className="dropzone-hint">
          {files.length > 0
            ? `${formatFileSize(files.reduce((acc, f) => acc + f.size, 0))} · พร้อมนำเข้าและแมปข้อมูลอัตโนมัติ`
            : "รองรับ 1) ไฟล์ออเดอร์ใน shipnity  2) ไฟล์รายได้ TikTok Shop  3) ไฟล์สินค้าในออเดอร์ shipnity (.xlsx / .csv)"}
        </span>
      </label>

      <div className="upload-actions flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          variant="default"
          onClick={upload}
          disabled={files.length === 0 || busy}
          loading={busy}
        >
          {busy
            ? `กำลังนำเข้า (${progress.percent}%)...`
            : files.length > 1
              ? `นำเข้าและแมปทั้ง ${files.length} ไฟล์`
              : "นำเข้าไฟล์"}
        </Button>
        {files.length > 0 && !busy ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => chooseFiles(null)}
            disabled={busy}
          >
            ล้างไฟล์ที่เลือก
          </Button>
        ) : null}
      </div>

      <Dialog
        open={progress.open}
        onOpenChange={(nextOpen) => {
          if (isProcessing) return;
          setProgress((prev) => ({ ...prev, open: nextOpen }));
        }}
      >
        <DialogContent
          showCloseButton={!isProcessing}
          className="no-print sm:max-w-[440px] rounded-2xl p-5 min-[640px]:p-6"
          onPointerDownOutside={(event) => {
            if (isProcessing) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isProcessing) event.preventDefault();
          }}
        >
          <DialogHeader
            className={cn(
              "text-left",
              isProcessing ? "pr-0" : "pr-11",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    progress.stage === "error"
                      ? "bg-[#fef3f2] text-destructive"
                      : progress.stage === "done"
                        ? "bg-[#ecfdf3] text-[#15803d]"
                        : "bg-secondary text-primary",
                  )}
                >
                  {progress.stage === "error" ? (
                    <IconAlert size={20} />
                  ) : progress.stage === "done" ? (
                    <IconCheckCircle size={20} />
                  ) : (
                    <IconUpload size={20} />
                  )}
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-base font-bold text-foreground">
                    {progress.stage === "error"
                      ? "นำเข้าไฟล์ไม่สำเร็จ"
                      : progress.stage === "done"
                        ? result?.duplicate
                          ? "ไฟล์นี้เคยนำเข้าแล้ว"
                          : "นำเข้าไฟล์สำเร็จ"
                        : "กำลังนำเข้าไฟล์รายได้"}
                  </DialogTitle>
                  <DialogDescription className="truncate text-xs text-muted-foreground">
                    {progress.filename}{" "}
                    {progress.fileSize > 0 ? `(${formatFileSize(progress.fileSize)})` : ""}
                  </DialogDescription>
                </div>
              </div>
              <Badge
                variant={
                  progress.stage === "error"
                    ? "destructive"
                    : progress.stage === "done"
                      ? "success"
                      : "secondary"
                }
                className="shrink-0 font-mono text-xs tabular-nums"
              >
                {progress.percent}%
              </Badge>
            </div>
          </DialogHeader>

          <div className="mt-1 space-y-4">
            <div className="rounded-xl border border-[#cbd5e1] bg-[#f8fafc] p-4 shadow-xs">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-[#475569]">
                  ความคืบหน้าทั้งหมด
                </span>
                <span className="font-mono text-2xl font-extrabold tracking-tight text-primary tabular-nums">
                  {progress.percent}%
                </span>
              </div>
              <Progress
                value={progress.percent}
                size="lg"
                tone={
                  progress.stage === "error"
                    ? "danger"
                    : progress.stage === "done"
                      ? "success"
                      : "default"
                }
                aria-label="ความคืบหน้าการอัปโหลดและนำเข้าไฟล์"
              />
              <p className="mt-2.5 text-center text-xs font-semibold text-[#0f172a] text-balance">
                {progress.message}
              </p>
            </div>

            <ul className="m-0 list-none space-y-2 p-0 text-xs" aria-label="ขั้นตอนการนำเข้า">
              {STEP_ITEMS.map((step, idx) => {
                const state = getStepState(
                  progress.stage,
                  progress.lastActiveStage,
                  step.key,
                );
                return (
                  <li
                    key={step.key}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors",
                      state === "done"
                        ? "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857] font-semibold"
                        : state === "error"
                          ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c] font-semibold"
                          : state === "active"
                            ? "border-[#fecdd3] bg-[#fff0f3] text-[#be123c] font-semibold"
                            : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                          state === "done"
                            ? "bg-[#059669] text-white"
                            : state === "error"
                              ? "bg-destructive text-white"
                              : state === "active"
                                ? "bg-primary text-white"
                                : "bg-[#e2e8f0] text-[#475569]",
                        )}
                      >
                        {state === "done" ? "✓" : state === "error" ? "!" : idx + 1}
                      </span>
                      <span className="truncate">{step.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums">
                      {step.key === "save" &&
                      (state === "active" || state === "error") &&
                      progress.current !== undefined &&
                      progress.total !== undefined
                        ? `${progress.current.toLocaleString("th-TH")}/${progress.total.toLocaleString("th-TH")}`
                        : state === "done"
                          ? "เสร็จสิ้น"
                          : state === "error"
                            ? "เกิดข้อผิดพลาด"
                            : state === "active"
                              ? "กำลังทำ..."
                              : "รอ"}
                    </span>
                  </li>
                );
              })}
            </ul>

            {progress.stage === "done" && result ? (
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#bfe8d2] bg-[#f3fdf7] p-3 text-center">
                <div>
                  <span className="block text-[11px] text-muted-foreground">จำนวนบิล</span>
                  <strong className="font-mono text-sm font-bold text-foreground tabular-nums">
                    {result.orderCount.toLocaleString("th-TH")}
                  </strong>
                </div>
                <div>
                  <span className="block text-[11px] text-muted-foreground">รายการทั้งหมด</span>
                  <strong className="font-mono text-sm font-bold text-foreground tabular-nums">
                    {result.transactionCount.toLocaleString("th-TH")}
                  </strong>
                </div>
                <div>
                  <span className="block text-[11px] text-muted-foreground">ตรวจยอด</span>
                  <strong className="text-sm font-bold text-foreground">
                    {result.reconciliation.matched === true
                      ? "ตรง"
                      : result.reconciliation.matched === false
                        ? "ไม่ตรง"
                        : "ไม่มีชีตสรุป"}
                  </strong>
                </div>
              </div>
            ) : null}

            {progress.stage === "error" && errorDetails.length > 0 ? (
              <div className="rounded-xl border border-[#f6cfcb] bg-[#fef3f2] p-3 text-center text-xs text-[#7a271a] text-balance">
                <ul className="m-0 inline-block list-disc space-y-1 pl-4 text-left">
                  {errorDetails.slice(0, 4).map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {!isProcessing ? (
            <DialogFooter className="mt-2 gap-2">
              {progress.stage === "done" && result ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setProgress((prev) => ({ ...prev, open: false }))}
                  >
                    ปิดหน้าต่าง
                  </Button>
                  <Button asChild variant="default">
                    <Link href={`/import/${result.importId}`}>
                      <IconFile size={16} />
                      ดูรายงานการนำเข้า
                    </Link>
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProgress((prev) => ({ ...prev, open: false }))}
                >
                  ปิดหน้าต่าง
                </Button>
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(mappingFile)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setMappingFile(null);
            setUnrecognizedHeaders([]);
            setFieldToHeader({});
          }
        }}
      >
        <DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
          <DialogHeader className="pr-14">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>จับคู่คอลัมน์เอง (Custom Column Mapping)</DialogTitle>
              <Badge variant="warning" size="sm">
                รูปแบบใหม่
              </Badge>
            </div>
            <DialogDescription className="truncate">
              ไฟล์: <strong className="font-mono">{mappingFile?.name ?? "-"}</strong> · เลือกคอลัมน์ในไฟล์ให้ตรงกับช่องข้อมูลของระบบ (รองรับ shipnity / TikTok / ไฟล์กำหนดเอง)
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55dvh] space-y-2.5 overflow-y-auto pr-1">
            {CUSTOM_MAPPING_FIELDS.map((field) => {
              const selectedHeader = fieldToHeader[field.key] ?? "";
              return (
                <div
                  key={field.key}
                  className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-xs font-medium text-foreground">
                    {field.label}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant={selectedHeader ? "secondary" : "outline"}
                        size="sm"
                        className="w-full justify-between font-mono text-xs sm:w-64"
                      >
                        <span className="truncate">
                          {selectedHeader || "— ไม่ระบุคอลัมน์ —"}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-64 w-64">
                      <DropdownMenuItem
                        onSelect={() =>
                          setFieldToHeader((prev) => {
                            const next = { ...prev };
                            delete next[field.key];
                            return next;
                          })
                        }
                      >
                        — ไม่ระบุคอลัมน์ —
                      </DropdownMenuItem>
                      {unrecognizedHeaders.map((header) => (
                        <DropdownMenuItem
                          key={`${field.key}-${header}`}
                          onSelect={() =>
                            setFieldToHeader((prev) => ({
                              ...prev,
                              [field.key]: header,
                            }))
                          }
                        >
                          {header}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <strong className="block text-xs font-semibold text-foreground">
                บันทึกการจับคู่คอลัมน์นี้ไว้ใช้ครั้งถัดไปอัตโนมัติ
              </strong>
              <span className="block text-[11px] text-muted-foreground">
                ระบบจะจำชื่อคอลัมน์ใหม่ลงฐานข้อมูล (app_settings) อัปโหลดครั้งหน้าไม่ต้องเลือกซ้ำ
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant={saveMappingForFuture ? "default" : "outline"}
              aria-pressed={saveMappingForFuture}
              onClick={() => setSaveMappingForFuture((prev) => !prev)}
            >
              {saveMappingForFuture ? "✓ บันทึกไว้ใช้ตลอด" : "ใช้เฉพาะครั้งนี้"}
            </Button>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMappingFile(null);
                setUnrecognizedHeaders([]);
                setFieldToHeader({});
              }}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={busy}
              onClick={uploadWithCustomMapping}
            >
              {busy ? "กำลังนำเข้า..." : "นำเข้าด้วยคอลัมน์ที่จับคู่"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error ? (
        <Card variant="danger" padding="compact" className="alert alert-error">
          <IconAlert size={18} />
          <div>
            <strong>{error}</strong>
            {errorDetails.length > 0 ? (
              <ul className="alert-list">
                {errorDetails.slice(0, 6).map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>
      ) : null}

      {result ? (
        <Card
          variant={result.duplicate ? "info" : "success"}
          padding="compact"
          className={cn("result-card", result.duplicate ? "info" : "success")}
        >
          <div className="result-head">
            <span className="result-icon">
              <IconCheckCircle size={22} />
            </span>
            <div>
              <strong>
                {batchResults.length > 1
                  ? `นำเข้าและเชื่อมข้อมูล ${batchResults.length} ไฟล์สำเร็จ`
                  : result.duplicate
                    ? "ไฟล์นี้เคยนำเข้าแล้ว"
                    : "นำเข้าสำเร็จ"}
              </strong>
              <p>
                {batchResults.length > 1
                  ? `ไฟล์ที่นำเข้า: ${batchResults.map((r) => r.filename).join(" · ")}`
                  : result.duplicate
                    ? "ระบบตรวจพบไฟล์เดิมจาก hash จึงไม่บันทึกซ้ำ"
                    : `ประมวลผล ${result.orderCount} ออเดอร์ จาก ${result.rowCount} แถวข้อมูล`}
              </p>
            </div>
          </div>

          <div className="result-stats">
            <span>
              <small>บิล</small>
              <strong>{result.orderCount}</strong>
            </span>
            <span>
              <small>รายการทั้งหมด</small>
              <strong>{result.transactionCount}</strong>
            </span>
            <span>
              <small>รอบชำระ</small>
              <strong>
                {result.periodStart ? formatDate(result.periodStart) : "-"}
              </strong>
            </span>
            <span>
              <small>ตรวจยอด</small>
              <strong>
                {result.reconciliation.matched === true
                  ? "ตรง"
                  : result.reconciliation.matched === false
                    ? "ไม่ตรง"
                    : "ไม่มีชีตสรุป"}
              </strong>
            </span>
          </div>

          {result.warnings.length > 0 ? (
            <details className="result-warnings">
              <summary>คำเตือน {result.warnings.length} รายการ</summary>
              <ul>
                {result.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="result-actions">
            <ExcelFilePreviewDialog
              importId={result.importId}
              filename={result.filename}
              fileType={result.fileType}
              rowCount={result.rowCount}
              triggerLabel="เปิดอ่านตาราง Excel"
            />
            <Button asChild variant="default">
              <Link href={`/import/${result.importId}`}>ดูรายงานการนำเข้า</Link>
            </Button>
            {result.periodStart ? (
              <Button asChild variant="secondary">
                <Link href={`/days/${result.periodStart}`}>
                  ดูรอบชำระ {formatDate(result.periodStart)}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href="/bills">ดูบิลทั้งหมด</Link>
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
