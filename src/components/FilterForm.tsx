"use client";

import type { ComponentProps } from "react";
import { usePathname, useRouter } from "next/navigation";
import { notifyNavigationStart } from "@/lib/navigation-progress";

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

export function FilterForm({
  action,
  onSubmit,
  children,
  ...props
}: Omit<ComponentProps<"form">, "method">) {
  const router = useRouter();
  const pathname = usePathname();

  function handleSubmit(event: FormSubmitEvent) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();

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
    notifyNavigationStart();
    router.push(qs ? `${targetPath}?${qs}` : targetPath, { scroll: false });
  }

  return (
    <form
      {...props}
      action={typeof action === "string" ? action : undefined}
      method="get"
      onSubmit={handleSubmit}
    >
      {children}
    </form>
  );
}
