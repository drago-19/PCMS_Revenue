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
import { AppMark, IconHome, IconReceipt, IconUpload } from "./icons";

const items = [
  { href: "/", label: "ภาพรวม", icon: IconHome },
  { href: "/import", label: "อัปโหลดรายได้", icon: IconUpload },
  { href: "/bills", label: "บิลทั้งหมด", icon: IconReceipt },
];

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="nav flex flex-col gap-2" aria-label="เมนูหลัก">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "inline-flex min-h-[42px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-colors",
              active ? "active" : undefined,
            )}
            aria-label={item.label}
            title={item.label}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={18} />
            <span className="!inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mobile-topbar no-print flex min-[980px]:hidden items-center justify-between gap-3 border-b border-border bg-card px-3.5 py-2.5">
        <Link
          href="/"
          className="brand inline-flex min-h-[40px] items-center gap-2.5 px-1"
        >
          <span className="brand-mark">
            <AppMark size={36} />
          </span>
          <span className="brand-text">
            <strong>PCMS Revenue</strong>
            <small>TikTok Shop · บิลรายวัน</small>
          </span>
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="เปิดเมนูหลัก"
              className="no-print"
            >
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="no-print flex w-[276px] max-w-[85vw] flex-col gap-6 bg-card p-5"
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
                    <small>TikTok Shop · บิลรายวัน</small>
                  </span>
                </Link>
              </SheetTitle>
              <SheetDescription className="sr-only">
                เมนูนำทางหลักของระบบ PCMS Revenue
              </SheetDescription>
            </SheetHeader>

            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />

            <div className="sidebar-foot mt-auto">
              <span>รายได้จาก TikTok Shop</span>
              <span>สรุปเป็นบิลแยกตามคำสั่งซื้อ</span>
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
            <small>TikTok Shop · บิลรายวัน</small>
          </span>
        </Link>

        <NavLinks pathname={pathname} />

        <div className="sidebar-foot">
          <span>รายได้จาก TikTok Shop</span>
          <span>สรุปเป็นบิลแยกตามคำสั่งซื้อ</span>
        </div>
      </aside>
    </>
  );
}
