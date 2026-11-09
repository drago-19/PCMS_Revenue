"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconDownload, IconFile, IconUpload } from "@/components/icons";

interface StockImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockImportDialog({ open, onOpenChange }: StockImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        toast.error("กรุณาเลือกไฟล์ Excel (.xlsx, .xls) หรือ .csv เท่านั้น");
        return;
      }
      setSelectedFile(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        toast.error("กรุณาเลือกไฟล์ Excel (.xlsx, .xls) หรือ .csv เท่านั้น");
        return;
      }
      setSelectedFile(file);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      toast.error("กรุณาเลือกไฟล์ Excel ก่อนกดอัปโหลด");
      return;
    }

    setUploading(true);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const res = await fetch("/api/products/stock-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(selectedFile.name),
        },
        body: arrayBuffer,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || "เกิดข้อผิดพลาดในการอัปเดตไฟล์");
        return;
      }

      const totalCount = (data.totalCount ?? data.updatedCount ?? 0) as number;
      const insertedCount = (data.insertedCount ?? 0) as number;
      const insertedMsg = insertedCount > 0 ? ` (เพิ่มรหัสใหม่ ${insertedCount.toLocaleString("th-TH")} รหัส)` : "";
      toast.success(
        `บันทึกข้อมูลสต็อกสำเร็จ ${totalCount.toLocaleString("th-TH")} รายการ${insertedMsg}`,
      );
      setSelectedFile(null);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader className="pr-12 text-left">
          <DialogTitle className="text-base font-bold text-[#0f172a]">
            อัปโหลดอัปเดตสต็อกและราคาทุน (Excel)
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-[#64748b]">
            อัปเดตราคาทุน สต็อกตั้งต้น และของเข้ารวม ของสินค้าหลายรหัสพร้อมกันในครั้งเดียว
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-4">
          {/* Step 1: Download template */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-[#334155]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-bold text-[#0f172a]">ขั้นตอนที่ 1: ดาวน์โหลดแม่แบบ Excel</span>
                <p className="mt-0.5 text-[11.5px] text-[#64748b]">
                  ดาวน์โหลดไฟล์ที่มีรหัสสินค้า (SKU) ทั้งหมด หรือเพิ่มแถวรหัสสินค้าใหม่ต่อท้ายในไฟล์ แล้วนำมาอัปโหลดเพื่อเพิ่มเข้าระบบอัตโนมัติ
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5 font-bold">
                <a href="/api/products/stock-export" download>
                  <IconDownload size={15} /> โหลดแม่แบบ
                </a>
              </Button>
            </div>
          </div>

          {/* Step 2: Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : selectedFile
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-slate-300 hover:border-slate-400 bg-white"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div className="space-y-1.5">
                <div className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <IconFile size={22} />
                </div>
                <div className="font-bold text-emerald-900">{selectedFile.name}</div>
                <p className="text-xs text-emerald-700">
                  {(selectedFile.size / 1024).toFixed(1)} KB · พร้อมอัปเดตเข้าระบบ
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="mt-1 text-slate-500 hover:text-rose-600"
                >
                  เลือกไฟล์ใหม่
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="inline-flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <IconUpload size={22} />
                </div>
                <div className="font-bold text-[#0f172a]">
                  ลากไฟล์ Excel มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์
                </div>
                <p className="text-xs text-[#64748b]">
                  รองรับไฟล์ .xlsx, .xls หรือ .csv ที่มีคอลัมน์รหัสสินค้า
                </p>
              </div>
            )}
          </div>

          {/* Quick Guidance Box */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11.5px] text-amber-950">
            <span className="font-bold">คำแนะนำ:</span>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900">
              <li>ระบบจะอัปเดตเฉพาะคอลัมน์ที่มีตัวเลข (คอลัมน์ที่เว้นว่างไว้จะไม่ถูกเขียนทับ)</li>
              <li>ยอดขายและสต็อกคงเหลือจะถูกคำนวณใหม่โดยอัตโนมัติ 100%</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? "กำลังนำเข้าข้อมูล..." : "อัปโหลดสต็อก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
