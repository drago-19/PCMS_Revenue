"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  KeyRoundIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  {
    href: "/settings",
    label: "ตั้งค่าเอกสาร / บริษัท",
    sub: "Document Settings",
    icon: SettingsIcon,
    match: (pathname: string) =>
      pathname === "/settings" || pathname.startsWith("/settings/"),
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

function AccountControls({ onAction }: { onAction?: () => void }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("ออกจากระบบเรียบร้อยแล้ว");
      onAction?.();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("ออกจากระบบไม่สำเร็จ");
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPwd) return;
    if (!currentPassword || !newPassword) {
      setPwdError("กรุณากรอกรหัสผ่านให้ครบทุกช่อง");
      return;
    }
    if (newPassword.length < 8) {
      setPwdError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    setSavingPwd(true);
    setPwdError(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setPwdError(payload.error ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
        return;
      }
      toast.success("เปลี่ยนรหัสผ่านสำเร็จ");
      setCurrentPassword("");
      setNewPassword("");
      setPwdOpen(false);
    } catch {
      setPwdError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="sidebar-foot mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-white">
        <ShieldCheckIcon className="size-3.5 text-[#00f2ea]" />
        <span>TikTok Shop · Protected</span>
      </div>
      <span className="mt-0.5 text-[11px] text-[#94a3b8]">
        ล็อกสิทธิ์เข้าถึงและบันทึก Audit Log
      </span>

      <div className="mt-2.5 flex flex-col gap-2">
        <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline-light"
              size="sm"
              className="w-full justify-start text-xs"
            >
              <KeyRoundIcon className="size-3.5" />
              เปลี่ยนรหัสผ่าน
            </Button>
          </DialogTrigger>
          <DialogContent className="no-print">
            <DialogHeader className="pr-11">
              <DialogTitle>เปลี่ยนรหัสผ่านผู้ดูแลระบบ</DialogTitle>
              <DialogDescription>
                รหัสผ่านใหม่จะถูกเข้ารหัสด้วย bcrypt (cost 12) และบันทึกในฐานข้อมูลทันที
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3.5">
              {pwdError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-xs font-semibold text-[#b91c1c]"
                >
                  {pwdError}
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="current-password-input"
                  className="text-xs font-bold text-[#0f172a]"
                >
                  รหัสผ่านปัจจุบัน
                </label>
                <Input
                  id="current-password-input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={savingPwd}
                  placeholder="กรอกรหัสผ่านปัจจุบัน"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="new-password-input"
                  className="text-xs font-bold text-[#0f172a]"
                >
                  รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
                </label>
                <Input
                  id="new-password-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={savingPwd}
                  placeholder="กรอกรหัสผ่านใหม่"
                  required
                />
              </div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={savingPwd}>
                    ยกเลิก
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="default"
                  loading={savingPwd}
                  disabled={savingPwd}
                >
                  บันทึกรหัสผ่านใหม่
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline-light"
          size="sm"
          onClick={handleLogout}
          loading={loggingOut}
          disabled={loggingOut}
          className="w-full justify-start border-[#fe2c55]/40 text-xs text-[#fecdd3] hover:bg-[#fe2c55] hover:text-white"
        >
          <LogOutIcon className="size-3.5" />
          {loggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/login") {
    return null;
  }

  return (
    <>
      <div className="mobile-topbar no-print flex min-[1100px]:hidden items-center justify-between gap-3 border-b border-[#1e293b] bg-[#0f1117] px-3.5 py-2.5 text-white">
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
            <SheetHeader className="p-0 pr-12 text-left">
              <SheetTitle asChild>
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="brand inline-flex min-h-[40px] items-center gap-3"
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

            <AccountControls onAction={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="sidebar no-print hidden min-[1100px]:flex">
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

        <AccountControls />
      </aside>
    </>
  );
}
