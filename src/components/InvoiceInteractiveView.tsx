"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, Loader2Icon, SaveIcon } from "lucide-react";
import {
  InvoiceDocument,
  type InvoiceMode,
  type InvoicePaperSize,
} from "@/components/InvoiceDocument";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { InvoiceModel } from "@/lib/invoice";

export function InvoiceInteractiveView({
  invoice,
  mode,
  paperSize,
  toolbarTop,
}: {
  invoice: InvoiceModel;
  mode: InvoiceMode;
  paperSize: InvoicePaperSize;
  toolbarTop: React.ReactNode;
}) {
  const [persistedBuyer, setPersistedBuyer] = useState(() => ({
    name: invoice.customer.name ?? "",
    taxId: invoice.customer.taxId ?? "",
    address: invoice.customer.address ?? "",
  }));

  const [buyerName, setBuyerName] = useState(persistedBuyer.name);
  const [buyerTaxId, setBuyerTaxId] = useState(persistedBuyer.taxId);
  const [buyerAddress, setBuyerAddress] = useState(persistedBuyer.address);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  useEffect(() => {
    const next = {
      name: invoice.customer.name ?? "",
      taxId: invoice.customer.taxId ?? "",
      address: invoice.customer.address ?? "",
    };
    setPersistedBuyer(next);
    setBuyerName(next.name);
    setBuyerTaxId(next.taxId);
    setBuyerAddress(next.address);
  }, [
    invoice.orderId,
    invoice.customer.name,
    invoice.customer.taxId,
    invoice.customer.address,
  ]);

  const latestRef = useRef({
    name: buyerName,
    taxId: buyerTaxId,
    address: buyerAddress,
  });
  latestRef.current = {
    name: buyerName,
    taxId: buyerTaxId,
    address: buyerAddress,
  };

  const isDirty =
    buyerName.trim() !== persistedBuyer.name.trim() ||
    buyerTaxId.trim() !== persistedBuyer.taxId.trim() ||
    buyerAddress.trim() !== persistedBuyer.address.trim();

  const saveBuyerToDb = useCallback(
    async (values?: { name: string; taxId: string; address: string }) => {
      const target = values ?? latestRef.current;
      setSaveState("saving");
      try {
        const res = await fetch(
          `/api/invoices/${encodeURIComponent(invoice.orderId)}/buyer`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              buyerName: target.name,
              buyerTaxId: target.taxId,
              buyerAddress: target.address,
            }),
          },
        );
        if (!res.ok) {
          setSaveState("error");
          return false;
        }
        setPersistedBuyer({
          name: target.name.trim(),
          taxId: target.taxId.trim(),
          address: target.address.trim(),
        });
        setSaveState("saved");
        return true;
      } catch {
        setSaveState("error");
        return false;
      }
    },
    [invoice.orderId],
  );

  useEffect(() => {
    if (mode !== "full" || !isDirty) return;
    const timer = window.setTimeout(() => {
      void saveBuyerToDb();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [mode, isDirty, buyerName, buyerTaxId, buyerAddress, saveBuyerToDb]);

  return (
    <>
      <Card className="no-print mb-5 w-full overflow-hidden border-border bg-white shadow-md min-[768px]:sticky min-[768px]:top-[61px] min-[768px]:z-30 min-[1100px]:top-0">
        {toolbarTop}
        {mode === "full" ? (
          <div className="border-t border-border bg-[#f8fafc] px-4 py-2.5 sm:px-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#475569]">
                  ชื่อผู้ซื้อ / บริษัท
                </label>
                <Input
                  value={buyerName}
                  onChange={(e) => {
                    setBuyerName(e.target.value);
                    setSaveState("idle");
                  }}
                  placeholder="ชื่อลูกค้า / บริษัท"
                  className="h-8 bg-white text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[#475569]">
                  เลขผู้เสียภาษีผู้ซื้อ (ถ้ามี)
                </label>
                <Input
                  value={buyerTaxId}
                  onChange={(e) => {
                    setBuyerTaxId(e.target.value);
                    setSaveState("idle");
                  }}
                  placeholder="เช่น 01055XXXXXXXX (13 หลัก)"
                  className="h-8 bg-white text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[#475569]">
                  ที่อยู่ผู้ซื้อ
                </label>
                <Input
                  value={buyerAddress}
                  onChange={(e) => {
                    setBuyerAddress(e.target.value);
                    setSaveState("idle");
                  }}
                  placeholder="ที่อยู่สำหรับออกใบกำกับภาษีเต็มรูป"
                  className="h-8 bg-white text-xs"
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#475569]">
                {saveState === "saving" ? (
                  <>
                    <Loader2Icon className="size-3.5 animate-spin text-[#2563eb]" />
                    <span className="text-[#2563eb]">
                      กำลังบันทึกข้อมูลผู้ซื้อ...
                    </span>
                  </>
                ) : saveState === "saved" ||
                  (!isDirty &&
                    (persistedBuyer.name ||
                      persistedBuyer.taxId ||
                      persistedBuyer.address)) ? (
                  <>
                    <CheckIcon className="size-3.5 text-[#059669]" />
                    <span className="font-semibold text-[#059669]">
                      บันทึกข้อมูลผู้ซื้อลงระบบแล้ว (พร้อมพิมพ์)
                    </span>
                  </>
                ) : saveState === "error" ? (
                  <span className="font-semibold text-[#dc2626]">
                    บันทึกไม่สำเร็จ กรุณากดปุ่มบันทึกอีกครั้ง
                  </span>
                ) : (
                  <span>
                    กรอกหรือแก้ไขข้อมูลผู้ซื้อสำหรับใบกำกับภาษีเต็มรูป (บันทึกอัตโนมัติ)
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant={isDirty ? "default" : "outline"}
                size="xs"
                loading={saveState === "saving"}
                onClick={() => void saveBuyerToDb()}
              >
                {saveState === "saving" ? null : (
                  <SaveIcon className="size-3.5" />
                )}
                บันทึกข้อมูลผู้ซื้อ
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <InvoiceDocument
        invoice={invoice}
        mode={mode}
        paperSize={paperSize}
        buyerOverride={
          mode === "full"
            ? {
                name: buyerName || invoice.customer.name || null,
                taxId: buyerTaxId || invoice.customer.taxId || null,
                address: buyerAddress || invoice.customer.address || null,
              }
            : undefined
        }
      />
    </>
  );
}
