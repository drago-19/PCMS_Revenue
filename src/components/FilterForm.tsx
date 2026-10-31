"use client";

import { useEffect, useRef, type ComponentProps, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  notifyNavigationCancel,
  notifyNavigationStart,
} from "@/lib/navigation-progress";

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

function normalizeQueryString(raw: string): string {
  const params = new URLSearchParams(raw);
  const entries = Array.from(params.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return new URLSearchParams(entries).toString();
}

export function FilterForm({
  action,
  onSubmit,
  children,
  autoSubmitDelay,
  ...props
}: Omit<ComponentProps<"form">, "method"> & {
  /** ms: ค้นหาอัตโนมัติเมื่อพิมพ์/ลบในช่อง type="search" (debounce) */
  autoSubmitDelay?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  const autoRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function scheduleAutoSubmit(form: HTMLFormElement, customDelay?: number) {
    if (autoSubmitDelay == null) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = customDelay ?? autoSubmitDelay;
    if (delay <= 0) {
      autoRef.current = true;
      form.requestSubmit();
      return;
    }
    timerRef.current = setTimeout(() => {
      autoRef.current = true;
      form.requestSubmit();
    }, delay);
  }

  function handleInput(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target?.type !== "search" || composingRef.current) return;
    const isCleared = target.value.trim() === "";
    scheduleAutoSubmit(event.currentTarget, isCleared ? 0 : autoSubmitDelay);
  }

  function handleSubmit(event: FormSubmitEvent) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);

    const formData = new FormData(event.currentTarget);
    const search = new URLSearchParams();
    for (const [key, rawValue] of formData.entries()) {
      if (typeof rawValue !== "string") continue;
      const trimmed = rawValue.trim();
      if (trimmed) {
        search.set(key, trimmed);
      }
    }
    const targetPath = typeof action === "string" && action ? action : pathname;
    const qs = search.toString();
    const url = qs ? `${targetPath}?${qs}` : targetPath;
    const isAuto = autoRef.current;
    autoRef.current = false;

    const currentQs = searchParams?.toString() ?? "";
    const isSameCommittedUrl =
      targetPath === pathname &&
      normalizeQueryString(qs) === normalizeQueryString(currentQs);

    if (isSameCommittedUrl) {
      notifyNavigationCancel();
      router.replace(url, { scroll: false });
      return;
    }

    notifyNavigationStart();
    // ค้นหาอัตโนมัติ: replace เพื่อไม่บันทึกประวัติเบราว์เซอร์ทุกครั้งที่พิมพ์
    if (isAuto) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  return (
    <form
      {...props}
      action={typeof action === "string" ? action : undefined}
      method="get"
      onSubmit={handleSubmit}
      onInput={handleInput}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const target = event.target as HTMLInputElement;
        if (target?.type === "search") {
          const isCleared = target.value.trim() === "";
          scheduleAutoSubmit(
            event.currentTarget,
            isCleared ? 0 : autoSubmitDelay,
          );
        }
      }}
    >
      {children}
    </form>
  );
}
