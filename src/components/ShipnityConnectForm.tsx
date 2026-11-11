"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconSpinner } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface ShipnityAccountSummary {
  id: string;
  label: string;
  email: string;
}

export interface ShipnityConnectFormProps {
  accounts: ShipnityAccountSummary[];
  source: "db" | "env" | null;
}

export function ShipnityConnectForm({ accounts, source }: ShipnityConnectFormProps) {
  const router = useRouter();
  const connected = accounts.length > 0;

  const [showForm, setShowForm] = useState(!connected);
  const [labelInput, setLabelInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/shipnity/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelInput, email: emailInput, password: passwordInput }),
      });
      const payload = (await response.json()) as {
        error?: string;
        shopName?: string | null;
        visibleOrders?: number;
      };
      if (!response.ok) {
        setError(payload.error ?? "เชื่อมต่อ Shipnity ไม่สำเร็จ");
        return;
      }
      setLabelInput("");
      setEmailInput("");
      setPasswordInput("");
      setShowForm(false);
      toast.success(
        `เชื่อมต่อ ${payload.shopName ?? emailInput} แล้ว · เห็นออเดอร์ ${payload.visibleOrders ?? 0} รายการ`,
      );
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string, label: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/shipnity/config?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "ลบบัญชีไม่สำเร็จ");
        return;
      }
      toast.success(`ลบบัญชี ${label} แล้ว`);
      router.refresh();
    } catch {
      setError("ลบบัญชีไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">บัญชี Shipnity ของบริษัทนี้</h2>
          <p className="text-xs text-muted-foreground">
            ล็อกอิน Shipnity แล้วระบบดึง token มาให้เอง — เพิ่มได้หลายบัญชี (หลายร้าน)
          </p>
        </div>
        {connected && !showForm ? (
          <Button type="button" variant="outline" className="h-10" onClick={() => setShowForm(true)}>
            + เพิ่มบัญชี
          </Button>
        ) : null}
      </div>

      {connected ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg bg-[#f8fafc]">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">{account.label}</span>
                {account.label === account.email ? null : (
                  <span className="text-muted-foreground">{account.email}</span>
                )}
                <Badge variant={source === "db" ? "success" : "neutral"}>
                  {source === "db" ? "บันทึกไว้ในระบบ" : "จาก .env"}
                </Badge>
              </div>
              {source === "db" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 text-destructive"
                  disabled={busy}
                  onClick={() => handleRemove(account.id, account.label)}
                >
                  ลบ
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {showForm ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <div className="grid gap-3 min-[768px]:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              อีเมลที่ใช้ล็อกอิน Shipnity
              <Input
                type="email"
                name="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="shop@example.com"
                autoComplete="username"
                required
                disabled={busy}
                className="h-10"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              รหัสผ่าน Shipnity
              <Input
                type="password"
                name="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                placeholder="รหัสผ่านของบัญชีนี้"
                autoComplete="current-password"
                required
                disabled={busy}
                className="h-10"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            ชื่อร้าน (ไม่บังคับ — ถ้าเว้นว่างจะใช้ชื่อร้านจาก Shipnity)
            <Input
              type="text"
              name="label"
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
              placeholder="เช่น Kissi Studio"
              autoComplete="off"
              className="h-10"
            />
          </label>

          <p className="text-[11.5px] text-muted-foreground">
            รหัสผ่านถูกส่งให้ Shipnity เพื่อล็อกอินครั้งเดียว ระบบไม่บันทึกไว้ — เก็บเฉพาะ token ที่ได้มา
          </p>

          {busy ? (
            <p role="status" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <IconSpinner size={14} />
              กำลังล็อกอิน Shipnity และทดสอบสิทธิ์ — อาจใช้เวลาหลายวินาที
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-10" disabled={busy} aria-busy={busy}>
              {busy ? (
                <>
                  <IconSpinner size={16} />
                  กำลังล็อกอิน Shipnity…
                </>
              ) : (
                "ล็อกอินและเชื่อมต่อ"
              )}
            </Button>
            {connected ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => setShowForm(false)}
                disabled={busy}
              >
                ยกเลิก
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        error ? (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {error}
          </p>
        ) : null
      )}
    </Card>
  );
}
