"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { compactDisplayString } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CompactValueToggle({
  value,
  className,
  stopPropagationOnClick = false,
}: {
  value: string;
  className?: string;
  stopPropagationOnClick?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { isCompactable, compactText, fullText } = compactDisplayString(value);

  if (!isCompactable) {
    return <span className={className}>{value}</span>;
  }

  function handleToggle(event: MouseEvent<HTMLSpanElement>) {
    if (stopPropagationOnClick) {
      event.preventDefault();
      event.stopPropagation();
    }
    setExpanded((prev) => !prev);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (stopPropagationOnClick) {
        event.stopPropagation();
      }
      setExpanded((prev) => !prev);
    }
  }

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
        "cursor-pointer select-none underline decoration-dotted decoration-current/35 underline-offset-4 transition-opacity hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      {expanded ? fullText : compactText}
    </span>
  );
}
