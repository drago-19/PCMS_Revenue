"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRightIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SwitchableOrderChannel } from "@/lib/queries";
import { cn } from "@/lib/utils";

const CHANNEL_OPTIONS: {
  key: SwitchableOrderChannel;
  label: string;
  dotColor: string;
}[] = [
  { key: "Facebook", label: "Facebook", dotColor: "bg-[#2563eb]" },
  { key: "LINE", label: "LINE OA", dotColor: "bg-[#06c755]" },
  { key: "Shopee", label: "Shopee", dotColor: "bg-[#ee4d2d]" },
  { key: "Other", label: "Other (อื่นๆ)", dotColor: "bg-[#64748b]" },
];

export function OrderChannelSwitcher({
  orderId,
  orderCode,
  currentChannel,
  transactionType,
  onSwitched,
  className,
}: {
  orderId: string;
  orderCode?: string | null;
  currentChannel?: string | null;
  transactionType?: string | null;
  onSwitched?: (result: {
    channel: SwitchableOrderChannel;
    invoiceNo: string | null;
  }) => void;
  className?: string;
}) {
  const router = useRouter();
  const [loadingChannel, setLoadingChannel] =
    useState<SwitchableOrderChannel | null>(null);

  const normalizedCurrent = (currentChannel || "TikTok").trim();
  const isSwitchable =
    transactionType === "คำสั่งซื้อ (OMS)" &&
    ["Facebook", "LINE", "Shopee", "Other"].includes(normalizedCurrent);

  if (!isSwitchable) {
    return null;
  }

  const quickTarget: SwitchableOrderChannel =
    normalizedCurrent === "Facebook"
      ? "LINE"
      : normalizedCurrent === "LINE"
        ? "Facebook"
        : "LINE";
  const quickTargetLabel = quickTarget === "LINE" ? "LINE OA" : quickTarget;

  async function handleSwitch(target: SwitchableOrderChannel) {
    if (target === normalizedCurrent || loadingChannel) return;
    setLoadingChannel(target);
    try {
      const res = await fetch(
        `/api/bills/${encodeURIComponent(orderId)}/channel`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: target }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: {
          channel: SwitchableOrderChannel;
          invoiceNo: string | null;
        };
      };
      if (!res.ok || !data.ok || !data.result) {
        toast.error(data.error || "ไม่สามารถสลับช่องทางได้");
        return;
      }

      const targetDisplay = target === "LINE" ? "LINE OA" : target;
      const displayCode = orderCode ? `#${orderCode}` : `#${orderId}`;
      toast.success(
        `ย้ายออเดอร์ ${displayCode} ไปยังช่องทาง ${targetDisplay} เรียบร้อยแล้ว${
          data.result.invoiceNo
            ? ` (เลขใบกำกับฯ: ${data.result.invoiceNo})`
            : ""
        }`,
      );
      onSwitched?.(data.result);
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อระบบ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoadingChannel(null);
    }
  }

  return (
    <div
      className={cn(
        "no-print inline-flex items-center gap-1",
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="xs"
        loading={loadingChannel === quickTarget}
        disabled={loadingChannel !== null}
        onClick={() => void handleSwitch(quickTarget)}
        title={`ย้ายออเดอร์นี้ไปช่องทาง ${quickTargetLabel} ทันที`}
        className="border-[#cbd5e1] bg-white text-[#0f172a] hover:bg-[#f1f5f9]"
      >
        {loadingChannel === quickTarget ? null : (
          <ArrowLeftRightIcon className="size-3.5 text-[#2563eb]" />
        )}
        <span>ย้ายไป {quickTargetLabel}</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={loadingChannel !== null}
            aria-label="เลือกช่องทางจำหน่ายอื่น"
            title="เลือกสลับไปช่องทางอื่น"
            className="px-1.5 border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f1f5f9]"
          >
            <ChevronDownIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            เปลี่ยนช่องทางออเดอร์
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CHANNEL_OPTIONS.map((opt) => {
            const isActive = opt.key === normalizedCurrent;
            return (
              <DropdownMenuItem
                key={opt.key}
                disabled={isActive || loadingChannel !== null}
                onClick={() => void handleSwitch(opt.key)}
                className="flex cursor-pointer items-center justify-between text-xs font-semibold"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className={cn("size-2 rounded-full", opt.dotColor)}
                    aria-hidden="true"
                  />
                  <span>{opt.label}</span>
                </span>
                {isActive ? (
                  <CheckIcon className="size-3.5 text-[#059669]" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
