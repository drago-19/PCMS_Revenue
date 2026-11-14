"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCheckCircle, IconInfo, IconWallet } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isSandboxShopName } from "@/lib/platform/platforms";

export interface TikTokAccountView {
  accountKey: string;
  shopName: string | null;
  shopCipher: string | null;
  region: string | null;
  status: string;
  lastError: string | null;
  accessTokenExpiresAt: string | null;
  connectedAt: string | null;
}

export interface TikTokConfigView {
  configured: boolean;
  appKey: string | null;
  serviceId: string | null;
  accounts: TikTokAccountView[];
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export function TikTokConnectCard({
  config,
  hostIsLocal = false,
  activeShopId = null,
}: {
  config: TikTokConfigView;
  /** เปิดจากเครื่อง dev — ลงทะเบียน webhook ไม่ได้ (จะไปทับของ production) */
  hostIsLocal?: boolean;
  /** ร้านที่ระบบใช้เป็นค่าเริ่มต้นอยู่ตอนนี้ */
  activeShopId?: string | null;
}) {
  const router = useRouter();
  const accounts = config.accounts;
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);
  const sandboxAccounts = accounts.filter((account) => isSandboxShopName(account.shopName));
  const realAccounts = accounts.filter((account) => !isSandboxShopName(account.shopName));
  // โหมดปัจจุบันอ่านจากร้านที่เลือกอยู่ว่าเป็นร้านทดสอบหรือร้านจริง
  const modeIsTest = isSandboxShopName(
    accounts.find((account) => account.accountKey === activeShopId)?.shopName,
  );

  /** สลับร้านเริ่มต้น (จริง ↔ ทดสอบ) — ไม่เขียนข้อมูลใด ๆ ทั้งสิ้น */
  const handleSetActive = async (shopId: string) => {
    if (switchingKey) return;
    setSwitchingKey(shopId);
    try {
      const res = await fetch("/api/platform/tiktok/active-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "สลับร้านไม่สำเร็จ");
        return;
      }
      toast.success("เปลี่ยนร้านเริ่มต้นแล้ว");
      router.refresh();
    } finally {
      setSwitchingKey(null);
    }
  };

  const [editing, setEditing] = useState(!config.configured);
  const [appKey, setAppKey] = useState(config.appKey ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [serviceId, setServiceId] = useState(config.serviceId ?? "");
  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/platform/tiktok/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appKey, appSecret, serviceId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      toast.success("บันทึกค่าเชื่อมต่อ TikTok แล้ว");
      setAppSecret("");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterWebhook() {
    setRegistering(true);
    try {
      const response = await fetch("/api/platform/tiktok/register-webhook", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        address?: string;
        results?: Array<{ shop: string | null; ok: boolean; error?: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "สมัครรับแจ้งเตือนไม่สำเร็จ");

      const failed = (payload.results ?? []).filter((item) => !item.ok);
      if (failed.length > 0) {
        throw new Error(failed.map((item) => `${item.shop ?? "ร้าน"}: ${item.error ?? "ไม่สำเร็จ"}`).join(" · "));
      }
      setRegistered(true);
      toast.success(`เปิดรับแจ้งเตือนจาก TikTok แล้ว — จะแจ้งเมื่อออเดอร์/คืนเงินเปลี่ยน`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สมัครรับแจ้งเตือนไม่สำเร็จ");
    } finally {
      setRegistering(false);
    }
  }

  async function handleTest(accountKey: string) {
    setTestingKey(accountKey);
    setTestResult((previous) => ({ ...previous, [accountKey]: "" }));
    try {
      const response = await fetch("/api/platform/tiktok/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountKey }),
      });
      const payload = (await response.json()) as {
        error?: string;
        count?: number;
        totalSettlement?: string;
        latest?: { statementTime: number; settlementAmount: string; currency: string; paymentStatus: string } | null;
      };
      if (!response.ok) throw new Error(payload.error || "ทดสอบไม่สำเร็จ");

      const latest = payload.latest;
      const message = latest
        ? `ดึงได้ ${payload.count ?? 0} statement · รวม ${payload.totalSettlement} ${latest.currency} · ล่าสุด ${new Date(latest.statementTime * 1000).toLocaleDateString("th-TH")} (${latest.paymentStatus})`
        : "ดึงได้ 0 statement ใน 30 วันล่าสุด";
      setTestResult((previous) => ({ ...previous, [accountKey]: message }));
      toast.success("ดึงข้อมูลจาก TikTok สำเร็จ");
    } catch (err) {
      const message = err instanceof Error ? err.message : "ทดสอบไม่สำเร็จ";
      setTestResult((previous) => ({ ...previous, [accountKey]: message }));
      toast.error(message);
    } finally {
      setTestingKey(null);
    }
  }

  return (
    <Card padding="padded" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
          >
            <IconWallet size={16} />
          </span>
          <span className="truncate text-[15px] font-bold">TikTok Shop</span>
        </div>
        {accounts.length > 0 ? (
          <Badge variant="success">เชื่อมแล้ว {accounts.length} ร้าน</Badge>
        ) : config.configured ? (
          <Badge variant="warning">ยังไม่เชื่อมร้าน</Badge>
        ) : (
          <Badge variant="neutral">ยังไม่ตั้งค่า</Badge>
        )}
      </div>

      {!editing && config.configured ? (
        <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-[13px] min-[420px]:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">App Key</dt>
            <dd className="mono truncate font-bold">{config.appKey}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Service ID</dt>
            <dd className="mono truncate font-bold">{config.serviceId}</dd>
          </div>
        </dl>
      ) : null}

      {accounts.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-muted-foreground">โหมด</span>
            <Badge variant={modeIsTest ? "warning" : "neutral"}>{modeIsTest ? "ทดสอบ" : "ใช้งานจริง"}</Badge>
            <Button
              size="sm"
              variant={modeIsTest ? "outline" : "secondary"}
              onClick={() => realAccounts[0] && handleSetActive(realAccounts[0].accountKey)}
              disabled={!realAccounts.length || !modeIsTest || switchingKey !== null}
            >
              ใช้ร้านจริง
            </Button>
            <Button
              size="sm"
              variant={modeIsTest ? "secondary" : "outline"}
              onClick={() => sandboxAccounts[0] && handleSetActive(sandboxAccounts[0].accountKey)}
              disabled={!sandboxAccounts.length || modeIsTest || switchingKey !== null}
            >
              {sandboxAccounts.length ? "ใช้ร้านทดสอบ" : "ยังไม่มีร้านทดสอบ"}
            </Button>
          </div>
          <p className="min-w-0 text-[12px] leading-5 text-muted-foreground">
            {modeIsTest
              ? "ทุกอย่างที่ทำบนหน้านี้ใช้ร้านทดสอบ ไม่กระทบร้านจริง"
              : sandboxAccounts.length
                ? "ใช้ร้านจริง — กด “ใช้ร้านทดสอบ” เพื่อทดสอบโดยไม่กระทบยอดขายจริง"
                : "ใช้ร้านจริง — ยังไม่มีร้านทดสอบในระบบ ต้องเชื่อมร้านทดสอบจาก Partner Center → Development Shops ก่อน"}
          </p>
        </div>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0">
          {accounts.map((account) => (
            <li
              key={account.accountKey}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[14px] font-bold">
                    <span className="truncate">{account.shopName ?? account.accountKey}</span>
                    {isSandboxShopName(account.shopName) ? <Badge variant="warning">ทดสอบ</Badge> : null}
                    {activeShopId === account.accountKey ? <Badge variant="neutral">กำลังใช้อยู่</Badge> : null}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {account.region ?? "—"} · เชื่อม {formatDateTime(account.connectedAt)} · token ถึง{" "}
                    {formatDateTime(account.accessTokenExpiresAt)}
                  </p>
                </div>
                <Badge variant={account.status === "error" ? "destructive" : "success"}>
                  {account.status === "error" ? "มีปัญหา" : "ใช้งานได้"}
                </Badge>
              </div>

              {account.lastError ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-[#f5dfae] bg-[#fffbeb] px-3 py-2 text-[12.5px] leading-6 text-[#7a4b0a]">
                  <IconInfo size={14} aria-hidden="true" className="mt-1 shrink-0" />
                  <span className="min-w-0 break-words">{account.lastError}</span>
                </p>
              ) : null}

              {testResult[account.accountKey] ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12.5px] leading-6">
                  <IconCheckCircle
                    size={14}
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-[#0d8a47]"
                  />
                  <span className="min-w-0 break-words">{testResult[account.accountKey]}</span>
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleTest(account.accountKey)}
                  disabled={testingKey !== null}
                  aria-busy={testingKey === account.accountKey}
                >
                  {testingKey === account.accountKey ? "กำลังดึง…" : "ทดสอบดึง Statement"}
                </Button>
                <Button
                  variant={activeShopId === account.accountKey ? "secondary" : "default"}
                  onClick={() => handleSetActive(account.accountKey)}
                  disabled={activeShopId === account.accountKey || switchingKey !== null}
                  aria-busy={switchingKey === account.accountKey}
                >
                  {activeShopId === account.accountKey
                    ? "ร้านที่ใช้อยู่"
                    : switchingKey === account.accountKey
                      ? "กำลังสลับ…"
                      : "ใช้ร้านนี้"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tt-app-key" className="text-[13px] font-bold">
              App Key
            </label>
            <Input
              id="tt-app-key"
              value={appKey}
              onChange={(event) => setAppKey(event.target.value)}
              placeholder="จาก Partner Center → App & Service"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tt-app-secret" className="text-[13px] font-bold">
              App Secret
            </label>
            <Input
              id="tt-app-secret"
              type="password"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              placeholder={config.configured ? "กรอกใหม่เมื่อต้องการเปลี่ยน" : "คัดลอกมาจากหน้าแอป"}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tt-service-id" className="text-[13px] font-bold">
              Service ID
            </label>
            <Input
              id="tt-service-id"
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              placeholder="ใช้สร้างลิงก์ authorize"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving} aria-busy={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึกค่า"}
            </Button>
            {config.configured ? (
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                ยกเลิก
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {config.configured ? (
            <Button asChild>
              <a href="/api/platform/tiktok/authorize">
                {accounts.length > 0 ? "เชื่อมร้านเพิ่ม" : "เชื่อมร้าน TikTok"}
              </a>
            </Button>
          ) : null}
          {accounts.length > 0 && config.configured ? (
            <Button
              variant="outline"
              onClick={handleRegisterWebhook}
              disabled={registering || registered || hostIsLocal}
              aria-busy={registering}
              title={
                hostIsLocal
                  ? "ต้องกดจากเว็บจริงเท่านั้น — การกดจากเครื่อง dev จะไปทับที่อยู่ของ production"
                  : registered
                    ? "เปิดรับแจ้งเตือนแล้ว"
                    : undefined
              }
            >
              {registering
                ? "กำลังสมัคร…"
                : registered
                  ? "เปิดรับแจ้งเตือนแล้ว"
                  : hostIsLocal
                    ? "เปิดรับแจ้งเตือน (เว็บจริงเท่านั้น)"
                    : "เปิดรับแจ้งเตือนจาก TikTok"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setEditing(true)}>
            แก้ไขค่าแอป
          </Button>
        </div>
      )}

      {accounts.length > 1 ? (
        <p className="text-[12.5px] leading-6 text-muted-foreground">
          เชื่อมร้านเพิ่มได้ทุกบัญชี seller ของบริษัท — ล็อกอินบัญชีที่จะเชื่อมแล้วกด
          &ldquo;เชื่อมร้านเพิ่ม&rdquo; ระบบจะเก็บ token แยกร้าน
        </p>
      ) : null}
    </Card>
  );
}
