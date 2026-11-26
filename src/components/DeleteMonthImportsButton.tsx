"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconTrash } from "./icons";

type ImportFileRow = {
  id: number;
  filename: string;
  periodStart: string | null;
  periodEnd: string | null;
  importedAt: string;
  transactionCount: number;
  orderCount: number;
};

type PreviewResponse = {
  month: string;
  label: string;
  files: ImportFileRow[];
  error?: string;
};

function currentMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return parts.slice(0, 7);
}

export function DeleteMonthImportsButton({
  totalFiles,
}: {
  totalFiles: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(currentMonthKey);
  const [label, setLabel] = useState("");
  const [files, setFiles] = useState<ImportFileRow[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletedSoFar, setDeletedSoFar] = useState(0);
  const router = useRouter();

  const loadPreview = useCallback(async (targetMonth: string) => {
    if (!targetMonth) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/imports/month?month=${encodeURIComponent(targetMonth)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as PreviewResponse;
      if (!response.ok) {
        setFiles([]);
        setError(payload.error ?? "อ่านรายการไฟล์ของเดือนนี้ไม่สำเร็จ");
        return;
      }
      setFiles(payload.files);
      setLabel(payload.label);
    } catch {
      setFiles([]);
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setConfirmText("");
    setDeletedSoFar(0);
    void loadPreview(month);
  }, [open, month, loadPreview]);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    setDeletedSoFar(0);
    let deletedTotal = 0;
    try {
      // ลบทีละชุด: ไฟล์ของเดือนหนึ่งมีได้เป็นร้อย คำขอเดียวจะยาวเกินจนถูกตัดกลางทาง
      for (;;) {
        const response = await fetch(
          `/api/imports/month?month=${encodeURIComponent(month)}&limit=2`,
          { method: "DELETE" },
        );
        const payload = (await response.json()) as {
          error?: string;
          deletedCount?: number;
          remaining?: number;
        };
        if (!response.ok) {
          const msg = payload.error ?? "ลบข้อมูลไม่สำเร็จ";
          setError(msg);
          toast.error(msg);
          return;
        }
        const deletedThisRound = payload.deletedCount ?? 0;
        deletedTotal += deletedThisRound;
        setDeletedSoFar(deletedTotal);
        if ((payload.remaining ?? 0) <= 0 || deletedThisRound === 0) break;
      }
      setOpen(false);
      toast.success(`ลบข้อมูลเดือน ${label || month} แล้ว ${deletedTotal} ไฟล์`);
      router.refresh();
    } catch {
      const msg =
        deletedTotal > 0
          ? `ลบไปแล้ว ${deletedTotal} ไฟล์ แล้วการเชื่อมต่อขาด — เปิดหน้าต่างนี้แล้วกดซ้ำเพื่อลบส่วนที่เหลือได้`
          : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (totalFiles <= 0) return null;

  const canDelete =
    files.length > 0 && confirmText.trim() === month && !busy && !loading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={busy} loading={busy}>
          <IconTrash size={16} /> ลบข้อมูลรายเดือน
        </Button>
      </DialogTrigger>
      <DialogContent className="no-print max-w-xl">
        <DialogHeader className="pr-11">
          <DialogTitle>ลบข้อมูลที่นำเข้าเป็นรายเดือน</DialogTitle>
          <DialogDescription>
            ลบไฟล์นำเข้าและบิลของเดือนที่เลือก เพื่อนำเข้าใหม่แล้วตรวจทีละเดือน
            เลขใบกำกับฯ ที่ออกไปแล้วจะไม่หาย (ระบบเก็บไว้และ void ให้)
            ไฟล์ที่คร่อมสองเดือนจะลบข้อมูลของอีกเดือนที่อยู่ในไฟล์เดียวกันด้วย
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-[#334155]">
            เดือนที่ต้องการลบ
            <Input
              type="month"
              value={month}
              max={currentMonthKey()}
              onChange={(event) => setMonth(event.target.value.slice(0, 7))}
              disabled={busy}
              className="w-full sm:w-56"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <div className="rounded-lg border border-border bg-[#f8fafc] px-3 py-2 text-sm">
            {loading ? (
              <span className="text-[#475569]">กำลังตรวจไฟล์ของเดือนนี้...</span>
            ) : files.length === 0 ? (
              <span className="text-[#475569]">
                ไม่มีไฟล์นำเข้าที่อยู่ในเดือนนี้
              </span>
            ) : (
              <>
                <div className="font-bold text-[#0f172a]">
                  พบ {files.length.toLocaleString("th-TH")} ไฟล์ ·{" "}
                  {files
                    .reduce((sum, file) => sum + file.transactionCount, 0)
                    .toLocaleString("th-TH")}{" "}
                  รายการ
                </div>
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-[#334155]">
                  {files.map((file) => (
                    <li key={file.id} className="break-all leading-snug">
                      {file.filename}
                      <span className="text-[#64748b]">
                        {" "}
                        ·{" "}
                        {file.periodStart && file.periodEnd
                          ? `${file.periodStart} ถึง ${file.periodEnd}`
                          : "ไม่มีช่วงวันที่ในไฟล์"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {busy && files.length > 0 ? (
            <p className="rounded-lg border border-border bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155]">
              กำลังลบ {deletedSoFar.toLocaleString("th-TH")} /{" "}
              {files.length.toLocaleString("th-TH")} ไฟล์...
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm font-semibold text-[#334155]">
            พิมพ์ {month} เพื่อยืนยัน
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={month}
              disabled={busy || files.length === 0}
              className="w-full sm:w-56"
            />
          </label>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              ยกเลิก
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete}
            loading={busy}
          >
            <IconTrash size={16} />
            {busy ? "กำลังลบ..." : "ยืนยันลบเดือนนี้"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
