"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { AnimatedValueText } from "@/components/AnimatedValueText";
import { compactDisplayString } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CompactValueToggle({
  value,
  className,
  stopPropagationOnClick = false,
  animate = false,
}: {
  value: string;
  className?: string;
  stopPropagationOnClick?: boolean;
  animate?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { isCompactable, compactText, fullText } = compactDisplayString(value);

  if (!isCompactable) {
    return (
      <span className={cn("tabular-nums", className)}>
        {animate ? <AnimatedValueText value={value} /> : value}
      </span>
    );
  }

  function handleToggle(event: MouseEvent<HTMLSpanElement>) {
    if (
      stopPropagationOnClick ||
      event.currentTarget.closest("[data-stat-breakdown-trigger]")
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
    setExpanded((prev) => !prev);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (
        stopPropagationOnClick ||
        event.currentTarget.closest("[data-stat-breakdown-trigger]")
      ) {
        event.stopPropagation();
      }
      setExpanded((prev) => !prev);
    }
  }

  const activeText = expanded ? fullText : compactText;

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      title={
        expanded
          ? `คลิกเพื่อย่อตัวเลข (${compactText})`
          : `คลิกเพื่อดูตัวเลขเต็ม (${fullText})`
      }
      aria-label={
        expanded
          ? `${fullText} คลิกเพื่อย่อเป็น ${compactText}`
          : `${compactText} คลิกเพื่อดูตัวเลขเต็ม ${fullText}`
      }
      data-compact-toggle="true"
      data-expanded={expanded ? "true" : "false"}
      className={cn(
        "cursor-pointer select-none tabular-nums underline decoration-dotted decoration-current/35 underline-offset-4 transition-opacity hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      {animate ? <AnimatedValueText value={activeText} /> : activeText}
    </span>
  );
}
