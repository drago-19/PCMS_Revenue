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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  stepKey: "upload" | "parse" | "save",
): "pending" | "active" | "done" {
  if (stage === "done") return "done";
  if (stepKey === "upload") {
    if (stage === "uploading") return "active";
    if (stage === "hashing" || stage === "parsing" || stage === "reconciling" || stage === "saving") {
      return "done";
    }
    return "pending";
  }
  if (stepKey === "parse") {
    if (stage === "hashing" || stage === "parsing" || stage === "reconciling") return "active";
    if (stage === "saving") return "done";
    return "pending";
  }
  if (stepKey === "save") {
    if (stage === "saving") return "active";
    return "pending";
  }
  return "pending";
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [progress, setProgress] = useState<UploadProgressState>({
    open: false,
    percent: 0,
    stage: "idle",
    message: "",
    filename: "",
    fileSize: 0,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function choose(nextFile: File | null) {
    setError(null);
    setErrorDetails([]);
    setResult(null);
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!/\.xlsx$/i.test(nextFile.name)) {
      const msg = "รองรับเฉพาะไฟล์ .xlsx ที่ export จาก TikTok Shop";
      setError(msg);
      toast.error(msg);
      setFile(null);
      return;
    }
    setFile(nextFile);
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setErrorDetails([]);
    setResult(null);

    const targetFile = file;
    setProgress({
      open: true,
      percent: 1,
      stage: "uploading",
      message: "กำลังส่งไฟล์ขึ้นเซิร์ฟเวอร์...",
      filename: targetFile.name,
      fileSize: targetFile.size,
    });

    try {
      const payload = await new Promise<
        | { ok: true; data: UploadResult }
        | { ok: false; error: string; details?: string[] }
      >((resolve, reject) => {
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
                message: msg.message,
                current: msg.current,
                total: msg.total,
              }));
            } else if (msg.type === "result") {
              resolved = true;
              setProgress((prev) => ({
                ...prev,
                percent: 100,
                stage: "done",
                message: msg.data.duplicate
                  ? "ไฟล์นี้เคยนำเข้าแล้ว ไม่ต้องบันทึกซ้ำ"
                  : `นำเข้าสำเร็จ สร้างบิล ${msg.data.orderCount.toLocaleString("th-TH")} ใบ`,
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
          setProgress((prev) => ({
            ...prev,
            percent: Math.max(prev.percent, mappedPercent),
            stage: uploadRatio >= 1 ? "hashing" : "uploading",
            message:
              uploadRatio >= 1
                ? "อัปโหลดครบแล้ว กำลังตรวจสอบไฟล์..."
                : `กำลังส่งไฟล์ขึ้นเซิร์ฟเวอร์ (${formatFileSize(event.loaded)} / ${formatFileSize(event.total)})`,
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
                  message: `นำเข้าสำเร็จ สร้างบิล ${parsed.orderCount.toLocaleString("th-TH")} ใบ`,
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
        xhr.send(body);
      });

      if (!payload.ok) {
        setError(payload.error);
        setErrorDetails(payload.details ?? []);
        toast.error(payload.error);
        return;
      }

      setResult(payload.data);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (payload.data.duplicate) {
        toast.info("ไฟล์นี้เคยนำเข้าแล้ว ระบบจึงไม่บันทึกซ้ำ");
      } else {
        toast.success(`นำเข้าสำเร็จ สร้างบิล ${payload.data.orderCount} ใบ`);
      }
      router.refresh();
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
          choose(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <Input
          ref={inputRef}
          id="income-file"
          type="file"
          accept=".xlsx"
          className="sr-only"
          aria-label="เลือกไฟล์รายได้ .xlsx"
          disabled={busy}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
        <span className="dropzone-icon">
          <IconUpload size={26} />
        </span>
        <strong className="break-all">
          {file ? file.name : "ลากไฟล์ .xlsx มาวาง หรือคลิกเพื่อเลือกไฟล์"}
        </strong>
        <span className="dropzone-hint">
          {file
            ? `${formatFileSize(file.size)} · พร้อมนำเข้า`
            : "ไฟล์รายได้จาก TikTok Shop (รายละเอียดคำสั่งซื้อ) — รองรับสูงสุด 25 MB"}
        </span>
      </label>

      <div className="upload-actions">
        <Button
          type="button"
          variant="default"
          onClick={upload}
          disabled={!file || busy}
          loading={busy}
        >
          {busy ? `กำลังนำเข้า (${progress.percent}%)...` : "นำเข้าไฟล์"}
        </Button>
        {file ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => choose(null)}
            disabled={busy}
          >
            ยกเลิก
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
          <DialogHeader className="text-left">
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
                className="font-mono text-xs tabular-nums"
              >
                {progress.percent}%
              </Badge>
            </div>
          </DialogHeader>

          <div className="mt-1 space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
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
              <p className="mt-2.5 text-xs font-medium text-foreground">
                {progress.message}
              </p>
            </div>

            <ul className="m-0 list-none space-y-2 p-0 text-xs" aria-label="ขั้นตอนการนำเข้า">
              {STEP_ITEMS.map((step, idx) => {
                const state = getStepState(progress.stage, step.key);
                return (
                  <li
                    key={step.key}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors",
                      state === "done"
                        ? "border-[#bfe8d2] bg-[#f3fdf7] text-[#15803d]"
                        : state === "active"
                          ? "border-[#cde9e2] bg-secondary/60 text-foreground font-semibold"
                          : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                          state === "done"
                            ? "bg-[#15803d] text-white"
                            : state === "active"
                              ? "bg-primary text-white"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {state === "done" ? "✓" : idx + 1}
                      </span>
                      <span className="truncate">{step.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums">
                      {step.key === "save" &&
                      state === "active" &&
                      progress.current !== undefined &&
                      progress.total !== undefined
                        ? `${progress.current.toLocaleString("th-TH")}/${progress.total.toLocaleString("th-TH")}`
                        : state === "done"
                          ? "เสร็จสิ้น"
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
              <div className="rounded-xl border border-[#f6cfcb] bg-[#fef3f2] p-3 text-xs text-[#7a271a]">
                <ul className="m-0 list-disc space-y-1 pl-4">
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
                {result.duplicate ? "ไฟล์นี้เคยนำเข้าแล้ว" : "นำเข้าสำเร็จ"}
              </strong>
              <p>
                {result.duplicate
                  ? "ระบบตรวจพบไฟล์เดิมจาก hash จึงไม่บันทึกซ้ำ"
                  : `สร้างบิลได้ ${result.orderCount} ใบ จาก ${result.rowCount} แถวข้อมูล`}
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
