"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  AppMark,
  IconCalendar,
  IconFile,
  IconHistory,
  IconHome,
  IconReceipt,
  IconUpload,
} from "./icons";

const items = [
  {
    href: "/",
    label: "ภาพรวมสรุปยอด",
    sub: "Finance Overview",
    icon: IconHome,
    match: (pathname: string) => pathname === "/",
  },
  {
    href: "/days",
    label: "รอบชำระเงินรายวัน",
    sub: "Daily Settlements",
    icon: IconCalendar,
    match: (pathname: string) =>
      pathname === "/days" || pathname.startsWith("/days/"),
  },
  {
    href: "/bills",
    label: "บิลคำสั่งซื้อทั้งหมด",
    sub: "Order Bills",
    icon: IconReceipt,
    match: (pathname: string) =>
      pathname === "/bills" ||
      pathname.startsWith("/bills/") ||
      pathname.startsWith("/invoices/"),
  },
  {
    href: "/products",
    label: "สรุปยอดรหัสสินค้า (SKU)",
    sub: "SKU Summary",
    icon: IconFile,
    match: (pathname: string) =>
      pathname === "/products" || pathname.startsWith("/products/"),
  },
  {
    href: "/import",
    label: "อัปโหลดไฟล์รายได้",
    sub: "Upload Statement",
    icon: IconUpload,
    match: (pathname: string) => pathname === "/import",
  },
  {
    href: "/history",
    label: "ประวัติการนำเข้าไฟล์",
    sub: "Import History",
    icon: IconHistory,
    match: (pathname: string) =>
      pathname === "/history" || pathname.startsWith("/import/"),
  },
];

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="px-3 text-[11px] font-bold tracking-[0.12em] uppercase text-[#64748b]">
        หมวดหมู่เมนู · Categories
      </span>
      <nav className="nav flex flex-col gap-1.5" aria-label="เมนูหลัก">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "inline-flex min-h-[46px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-all",
                active ? "active" : undefined,
              )}
              aria-label={item.label}
              title={item.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} />
              <span className="flex flex-col leading-tight">
                <span className="!inline font-bold">{item.label}</span>
                <span
                  className={cn(
                    "text-[11px] font-normal",
                    active ? "text-white/80" : "text-[#64748b]",
                  )}
                >
                  {item.sub}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mobile-topbar no-print flex min-[980px]:hidden items-center justify-between gap-3 border-b border-[#1e293b] bg-[#0f1117] px-3.5 py-2.5 text-white">
        <Link
          href="/"
          className="brand inline-flex min-h-[40px] items-center gap-2.5 px-1"
        >
          <span className="brand-mark">
            <AppMark size={36} />
          </span>
          <span className="brand-text">
            <strong>PCMS Revenue</strong>
            <small>TikTok Shop · Seller Finance</small>
          </span>
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline-light"
              size="icon"
              aria-label="เปิดเมนูหลัก"
              className="no-print"
            >
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="no-print flex w-[276px] max-w-[85vw] flex-col gap-6 border-r border-[#1e293b] bg-[#0f1117] p-5 text-white"
          >
            <SheetHeader className="p-0 text-left">
              <SheetTitle asChild>
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="brand inline-flex min-h-[40px] items-center gap-3 pr-10"
                >
                  <span className="brand-mark">
                    <AppMark size={38} />
                  </span>
                  <span className="brand-text">
                    <strong>PCMS Revenue</strong>
                    <small>TikTok Shop · Seller Finance</small>
                  </span>
                </Link>
              </SheetTitle>
              <SheetDescription className="sr-only">
                เมนูนำทางหลักของระบบ PCMS Revenue
              </SheetDescription>
            </SheetHeader>

            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />

            <div className="sidebar-foot mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="size-2 rounded-full bg-[#00f2ea] shadow-[0_0_8px_#00f2ea]" />
                TikTok Shop Reconciliation
              </div>
              <span className="mt-1 text-[11px] text-[#94a3b8]">
                สรุปบิลและตรวจยอดอัตโนมัติรายคำสั่งซื้อ
              </span>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <aside className="sidebar no-print hidden min-[980px]:flex">
        <Link href="/" className="brand min-h-[44px]">
          <span className="brand-mark">
            <AppMark size={38} />
          </span>
          <span className="brand-text">
            <strong>PCMS Revenue</strong>
            <small>TikTok Shop · Seller Finance</small>
          </span>
        </Link>

        <NavLinks pathname={pathname} />

        <div className="sidebar-foot rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <span className="size-2 rounded-full bg-[#00f2ea] shadow-[0_0_8px_#00f2ea]" />
            TikTok Shop Reconciliation
          </div>
          <span className="mt-1 text-[11px] text-[#94a3b8]">
            สรุปบิลและตรวจยอดอัตโนมัติรายคำสั่งซื้อ
          </span>
        </div>
      </aside>
    </>
  );
}
