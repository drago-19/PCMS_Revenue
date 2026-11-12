"use client";

// ปุ่มคัดลอกข้อความ (เช่น เลขคำสั่งซื้อ) — ใช้ Clipboard API พร้อมแจ้งผลทาง aria-live
import { useState } from "react";

export function CopyButton({ value, label = "คัดลอก" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} ${value}`}
      title={copied ? "คัดลอกแล้ว" : label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="size-4">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h8" />
      </svg>
      <span className="sr-only" aria-live="polite">
        {copied ? "คัดลอกแล้ว" : ""}
      </span>
    </button>
  );
}
