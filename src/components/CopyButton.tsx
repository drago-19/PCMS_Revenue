"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { IconAlert, IconCheckCircle, IconCopy } from "./icons";

async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // ผู้ใช้กดปฏิเสธสิทธิ์ clipboard ให้ลองวิธี legacy ด้านล่าง
    }
  }
  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.readOnly = true;
  scratch.style.position = "fixed";
  scratch.style.top = "-1000px";
  scratch.setAttribute("aria-hidden", "true");
  document.body.appendChild(scratch);
  scratch.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    scratch.remove();
  }
  return copied;
}

export function CopyButton({
  value,
  label = "คัดลอกหมายเลขคำสั่งซื้อ",
}: {
  value: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleClick() {
    const ok = await copyToClipboard(value);
    setStatus(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 1800);
  }

  const Icon =
    status === "copied" ? IconCheckCircle : status === "failed" ? IconAlert : IconCopy;
  const hint =
    status === "copied" ? "คัดลอกแล้ว" : status === "failed" ? "คัดลอกไม่สำเร็จ" : label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "copy-btn no-print shrink-0 align-middle min-[768px]:size-7 min-[768px]:min-h-[28px] min-[768px]:min-w-[28px]",
            status !== "idle" && status,
          )}
          title={hint}
          aria-label={`${hint} ${value}`}
          onClick={handleClick}
        >
          <Icon size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="no-print">{hint}</TooltipContent>
    </Tooltip>
  );
}
