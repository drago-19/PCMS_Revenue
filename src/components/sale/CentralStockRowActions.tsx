"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MinusIcon, PlusIcon } from "lucide-react";
import { SALE_THEME } from "@/lib/sale/theme";
import { platformImageSrc } from "@/lib/platform/image-proxy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PRESETS = [1, 5, 10, 50] as const;
const MAX_AMOUNT = 9999;

/**
 * จัดการรหัสกลางต่อแถว: ปรับจำนวน (แบบเดียวกับหน้าปรับสต็อกของร้าน — ปุ่มลัด ไม่มีช่องพิมพ์อิสระ)
 * · เปลี่ยนชื่อ · เลิกใช้รหัส
 * เลิกใช้ = ซ่อนจากรายการและตัดการผูก แต่ประวัติการเคลื่อนไหวอยู่ครบ
 */
export function CentralStockRowActions({
  skuCode,
  productName,
  onHand,
  hasImage,
  imageUrl,
  shopCount,
  listingCount,
  updatedAtText,
}: {
  skuCode: string;
  productName: string | null;
  onHand: number;
  hasImage: boolean;
  imageUrl: string | null;
  shopCount: number;
  listingCount: number;
  /** หน้าเว็บจัดรูปวันที่มาให้แล้ว (thaiDateTime) — คอมโพเนนต์นี้เป็น client จึงรับสตริง */
  updatedAtText: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(productName ?? "");
  const [newCode, setNewCode] = useState(skuCode);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState(0);
  const [base, setBase] = useState(onHand);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    setBase(onHand);
  }, [onHand]);

  const maxAmount = mode === "remove" ? Math.max(base, 0) : MAX_AMOUNT;
  const clamp = (value: number) => Math.min(maxAmount, Math.max(0, Math.trunc(value)));
  const effective = Math.min(amount, maxAmount);
  const nextQuantity = mode === "add" ? base + effective : Math.max(base - effective, 0);
  const removeDisabled = base <= 0;

  function changeMode(next: "add" | "remove") {
    setMode(next);
    setAmount(0);
  }

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const response = await fetch("/api/platform/central-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "ทำรายการไม่สำเร็จ");
      return null;
    }
    setError(null);
    return payload;
  }

  async function saveName() {
    if (busy) return;
    setBusy("rename");
    setNotice(null);
    const result = await post({ action: "rename", skuCode, productName: name });
    setBusy(null);
    if (!result) return;
    setNotice("บันทึกชื่อแล้ว");
    router.refresh();
  }

  async function changeCode() {
    if (busy) return;
    const next = newCode.trim();
    if (!next || next === skuCode) return;
    setBusy("code");
    setNotice(null);
    const result = await post({ action: "rename-code", skuCode, newSkuCode: next });
    setBusy(null);
    if (!result) return;
    setOpen(false);
    router.refresh();
  }

  async function adjust() {
    if (busy || effective < 1) return;
    setBusy("adjust");
    setNotice(null);
    const delta = mode === "add" ? effective : -effective;
    const result = await post({ action: "receive", skuCode, quantity: delta });
    setBusy(null);
    if (!result) return;
    const pushed = Number(result.pushed ?? 0);
    const failed = Number(result.pushFailed ?? 0);
    const nextOnHand = Number(result.onHand ?? 0);
    setBase(nextOnHand);
    setAmount(0);
    setNotice(
      `${mode === "add" ? "เติม" : "ตัด"} ${effective} แล้ว · คงเหลือกลางตอนนี้ ${nextOnHand}${
        pushed > 0 ? ` · เขียนลงประกาศ ${pushed} ร้าน` : ""
      }${failed > 0 ? ` · พลาด ${failed} ร้าน` : ""}`,
    );
    router.refresh();
  }

  async function archive() {
    if (busy) return;
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    setBusy("archive");
    setNotice(null);
    const result = await post({ action: "archive", skuCode });
    setBusy(null);
    if (!result) return;
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* แถวทั้งแถวกดได้ — เปิดป๊อปอัพจัดการโดยไม่ต้องมีปุ่ม จัดการ */}
      <tr
        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        tabIndex={0}
        aria-haspopup="dialog"
      >
        <td className="py-1.5 pr-2">
          <span className="flex size-9 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {hasImage ? (
              <img
                src={`/api/platform/central-stock/image?code=${encodeURIComponent(skuCode)}`}
                alt={`รูป ${skuCode}`}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : imageUrl ? (
              <img
                src={platformImageSrc(imageUrl) ?? imageUrl}
                alt={`รูป ${skuCode}`}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : null}
          </span>
        </td>
        <td className="mono py-1.5 pr-2 font-bold">{skuCode}</td>
        <td className="max-w-[260px] truncate py-1.5 pr-2">{productName ?? "—"}</td>
        <td className={cn("mono py-1.5 pr-2 text-right font-bold", onHand <= 0 ? "text-[#b42318]" : "")}>
          {onHand.toLocaleString("th-TH")}
        </td>
        <td className="mono py-1.5 pr-2 text-right">{shopCount.toLocaleString("th-TH")}</td>
        <td className="mono py-1.5 pr-2 text-right">{listingCount.toLocaleString("th-TH")}</td>
        <td className="py-1.5 pr-2 text-right text-muted-foreground">{updatedAtText}</td>
        <td className="py-1.5 text-right text-muted-foreground">
          <ChevronRight className="ml-auto size-4" aria-hidden="true" />
        </td>
      </tr>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setConfirmArchive(false);
          setError(null);
          setNotice(null);
          setAmount(0);
        }}
      >
      {/* SALE_THEME ต้องส่งเข้ามาเอง — dialog เรนเดอร์ใน portal หลุดจากตัวครอบธีมของหน้า
          ไม่งั้นสีเขียว/แดง (var --ok/--danger) จะไม่มีค่า ปุ่มกลายเป็นกล่องโปร่ง */}
      <DialogContent className="max-w-[460px]" style={SALE_THEME}>
        <DialogHeader className="pr-11">
          <DialogTitle className="mono text-[15px]">{skuCode}</DialogTitle>
          <DialogDescription>คงเหลือกลางตอนนี้ {base.toLocaleString("th-TH")} ชิ้น</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <section aria-label="ปรับจำนวนสต็อกกลาง" className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-bold">ปรับจำนวนสต็อกกลาง</h3>
              <span className="text-[11.5px] text-muted-foreground">ดูยอดใหม่ก่อนยืนยันทุกครั้ง</span>
            </div>

            <div role="group" aria-label="เลือกว่าจะเพิ่มหรือลด" className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => changeMode("add")}
                aria-pressed={mode === "add"}
                className={cn(
                  "min-h-[40px] rounded-lg border text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // สีทึบชัดเจน: เติมเข้า = เขียว · ตัดออก = แดง แยกกันตาเห็นทันที
                  mode === "add"
                    ? "border-transparent bg-[color:var(--ok)] text-white hover:bg-[color:var(--ok)]/90"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                เติมเข้า
              </button>
              <button
                type="button"
                onClick={() => changeMode("remove")}
                aria-pressed={mode === "remove"}
                disabled={removeDisabled}
                className={cn(
                  "min-h-[40px] rounded-lg border text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                  mode === "remove"
                    ? "border-transparent bg-[color:var(--danger)] text-white hover:bg-[color:var(--danger)]/90"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                ตัดออก
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="จำนวนที่จะปรับลงหนึ่ง"
                onClick={() => setAmount((value) => clamp(value - 1))}
                disabled={busy !== null || amount <= 0}
                className="size-12"
              >
                <MinusIcon className="size-5" aria-hidden="true" />
              </Button>
              <span
                aria-live="polite"
                aria-label={`จำนวนที่ต้องการ${mode === "add" ? "เติม" : "ตัด"} ${effective}`}
                className="min-w-[72px] text-center text-[32px] font-bold leading-none tabular-nums"
              >
                {effective}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="จำนวนที่จะปรับขึ้นหนึ่ง"
                onClick={() => setAmount((value) => clamp(value + 1))}
                disabled={busy !== null || (mode === "remove" && effective >= base)}
                className="size-12"
              >
                <PlusIcon className="size-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={effective === preset ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setAmount((value) => clamp(value + preset))}
                  disabled={busy !== null || amount >= maxAmount}
                  aria-label={`บวกเพิ่ม ${preset}`}
                  className="min-h-[40px] tabular-nums"
                >
                  +{preset}
                </Button>
              ))}
              {/* ปุ่มลดโชว์เมื่อมีจำนวนค้างให้ลด — จำนวน 0 จะไม่มีปุ่มลดเลย */}
              {PRESETS.map((preset) =>
                amount >= preset ? (
                  <Button
                    key={`minus-${preset}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount((value) => clamp(value - preset))}
                    disabled={busy !== null}
                    aria-label={`ลดลง ${preset}`}
                    className="min-h-[40px] tabular-nums"
                  >
                    −{preset}
                  </Button>
                ) : null,
              )}
            </div>



            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
              <span className="text-muted-foreground">
                คงเหลือ <span className="font-bold tabular-nums text-foreground">{base}</span>
              </span>
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <span className="text-muted-foreground">
                จะเป็น{" "}
                <span className={cn("font-bold tabular-nums", mode === "add" ? "text-[#0d6b3c]" : "text-[#b42318]")}>
                  {nextQuantity}
                </span>
              </span>
              {amount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAmount(0)}
                  disabled={busy !== null}
                  className="min-h-[32px] px-2 text-[12px] text-muted-foreground"
                >
                  ล้าง
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={adjust}
              disabled={busy !== null || effective < 1}
              aria-busy={busy === "adjust"}
              className={cn(
                "min-h-[44px] w-full text-white",
                mode === "add" ? "bg-[color:var(--ok)] hover:bg-[color:var(--ok)]/90" : "bg-[color:var(--danger)] hover:bg-[color:var(--danger)]/90",
              )}
            >
              {busy === "adjust" ? "กำลังบันทึก…" : `ยืนยัน${mode === "add" ? "เติม" : "ตัด"} ${effective} ชิ้น`}
            </Button>
            <p className="text-[11.5px] text-muted-foreground">
              ยอดใหม่จะถูกเขียนลงประกาศของทุกร้านที่ผูกไว้ในรอบถัดไป
            </p>
          </section>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <label htmlFor={`name-${skuCode}`} className="text-[12px] font-semibold">
              ชื่อสินค้า
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`name-${skuCode}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-10 text-[13px]"
                placeholder="ชื่อไว้ดูในรายการ"
              />
              <Button type="button" size="sm" onClick={saveName} disabled={busy !== null}>
                {busy === "rename" ? "…" : "บันทึก"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <label htmlFor={`code-${skuCode}`} className="text-[12px] font-semibold">
              แก้รหัสกลาง (กรณีพิมพ์ผิด)
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`code-${skuCode}`}
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                className="mono h-10 text-[13px]"
                aria-label="รหัสกลางใหม่"
              />
              <Button
                type="button"
                size="sm"
                onClick={changeCode}
                disabled={busy !== null || !newCode.trim() || newCode.trim() === skuCode}
              >
                {busy === "code" ? "…" : "เปลี่ยนรหัส"}
              </Button>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              ย้ายยอด การผูก ประวัติ และรูปไปรหัสใหม่ทั้งหมด — ต้องไม่ซ้ำกับรหัสที่มีอยู่
            </p>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="text-[12px] font-semibold">ลบรหัสกลาง (เลิกใช้)</p>
            <p className="text-[11.5px] text-muted-foreground">
              ซ่อนจากรายการและตัดการผูกทุกร้าน (หยุดหัก/หยุดเขียนยอด) — ประวัติยังอยู่ครบ นำกลับได้ที่การ์ด “รหัสที่เลิกใช้แล้ว”
            </p>
            <Button
              type="button"
              size="sm"
              variant={confirmArchive ? "default" : "outline"}
              onClick={archive}
              disabled={busy !== null}
            >
              {busy === "archive" ? "กำลังบันทึก…" : confirmArchive ? "ยืนยันลบรหัสนี้" : "ลบ / เลิกใช้รหัส"}
            </Button>
          </div>

          {error ? (
            <p className="text-[12.5px] font-semibold text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="text-[12.5px] font-semibold text-[color:var(--ok)]" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
