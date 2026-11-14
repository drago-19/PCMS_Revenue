"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCheckCircle, IconInfo, IconWallet } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface ShopeeAccountView {
  accountKey: string;
  shopName: string | null;
  shopCipher: string | null;
  region: string | null;
  status: string;
  lastError: string | null;
  accessTokenExpiresAt: string | null;
  connectedAt: string | null;
}

export interface ShopeeConfigView {
  configured: boolean;
  partnerId: string | null;
  env: "sandbox" | "live";
  redirectBaseUrl: string | null;
  pushCallbackUrl?: string | null;
  accounts: ShopeeAccountView[];
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export function ShopeeConnectCard({
  config,
  hostIsLocal = false,
}: {
  config: ShopeeConfigView;
  hostIsLocal?: boolean;
}) {
  const router = useRouter();
  const accounts = config.accounts;
  const webhookUrl =
    config.pushCallbackUrl ??
    `${(config.redirectBaseUrl ?? (typeof window === "undefined" ? "" : window.location.origin)).replace(/\/+$/, "")}/api/platform/shopee/webhook`;

  async function handleCopyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("คัดลอก Callback URL แล้ว");
    } catch {
      toast.error("คัดลอกอัตโนมัติไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเอง");
    }
  }

  const [editing, setEditing] = useState(!config.configured);
  const [env, setEnv] = useState<"sandbox" | "live">(config.env);
  const [partnerId, setPartnerId] = useState(config.partnerId ?? "");
  const [partnerKey, setPartnerKey] = useState("");
  const [redirectBaseUrl, setRedirectBaseUrl] = useState(
    config.redirectBaseUrl ?? (hostIsLocal ? "https://revenue.goldpulse-ai.com" : ""),
  );
  const [saving, setSaving] = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualShopId, setManualShopId] = useState("");
  const [exchanging, setExchanging] = useState(false);

  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<Record<string, string>>({});

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/platform/shopee/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partnerId,
          partnerKey,
          env,
          redirectBaseUrl,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกค่า Shopee ไม่สำเร็จ");
      toast.success("บันทึกค่าเชื่อมต่อ Shopee แล้ว");
      setPartnerKey("");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกค่า Shopee ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleManualExchange() {
    setExchanging(true);
    try {
      const response = await fetch("/api/platform/shopee/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          callbackUrl.trim()
            ? { callbackUrl: callbackUrl.trim() }
            : { code: manualCode.trim(), shopId: manualShopId.trim() },
        ),
      });
      const payload = (await response.json()) as {
        error?: string;
        shop?: { shopName: string; shopId: string };
      };
      if (!response.ok) throw new Error(payload.error || "แลก Token ไม่สำเร็จ");
      toast.success(`เชื่อมร้าน ${payload.shop?.shopName ?? ""} สำเร็จ`);
      setCallbackUrl("");
      setManualCode("");
      setManualShopId("");
      setShowManual(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "แลก Token ไม่สำเร็จ");
    } finally {
      setExchanging(false);
    }
  }

  async function handleTest(accountKey: string) {
    setTestingKey(accountKey);
    try {
      const response = await fetch("/api/platform/shopee/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountKey }),
      });
      const payload = (await response.json()) as {
        error?: string;
        shop?: string;
        env?: string;
        recentOrders?: number;
        skus?: number;
      };
      if (!response.ok) throw new Error(payload.error || "ทดสอบไม่สำเร็จ");
      const msg = `ผ่าน (${payload.env === "live" ? "Live" : "Sandbox"} · ออเดอร์ 15 วัน ${payload.recentOrders ?? 0} · สต็อก ${payload.skus ?? 0} SKU)`;
      setActionResult((prev) => ({ ...prev, [accountKey]: msg }));
      toast.success(`${payload.shop ?? "Shopee"}: ${msg}`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ทดสอบไม่สำเร็จ";
      setActionResult((prev) => ({ ...prev, [accountKey]: msg }));
      toast.error(msg);
      router.refresh();
    } finally {
      setTestingKey(null);
    }
  }

  async function handleSyncNow(accountKey: string) {
    setSyncingKey(accountKey);
    try {
      const response = await fetch(
        `/api/platform/shopee/sync-now?wait=1&shop=${encodeURIComponent(accountKey)}`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        error?: string;
        stats?: { orders: number; orderFinance: number; skus: number };
      };
      if (!response.ok) throw new Error(payload.error || "ซิงก์ไม่สำเร็จ");
      const msg = `ซิงก์แล้ว: ออเดอร์ ${payload.stats?.orders ?? 0} · ยอดโอน ${payload.stats?.orderFinance ?? 0} · สต็อก ${payload.stats?.skus ?? 0} SKU`;
      setActionResult((prev) => ({ ...prev, [accountKey]: msg }));
      toast.success(msg);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ซิงก์ไม่สำเร็จ";
      setActionResult((prev) => ({ ...prev, [accountKey]: msg }));
      toast.error(msg);
    } finally {
      setSyncingKey(null);
    }
  }

  const connectedCount = accounts.filter((a) => a.status === "connected").length;
  const BadgeIcon: ComponentType<{ className?: string }> =
    connectedCount > 0 ? IconCheckCircle : config.configured ? IconInfo : IconWallet;

  return (
    <Card padding="padded" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-xs font-extrabold text-white">
            SP
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[15px] font-bold">Shopee</span>
              <Badge variant={config.env === "live" ? "success" : "warning"}>
                {config.env === "live" ? "Live" : "Sandbox"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ดึงออเดอร์ · Escrow · สต็อกสินค้า (แยกจากข้อมูล Excel)
            </p>
          </div>
        </div>
        <Badge
          variant={connectedCount > 0 ? "success" : config.configured ? "info" : "neutral"}
        >
          <BadgeIcon className="h-3 w-3" />
          {connectedCount > 0
            ? `เชื่อมแล้ว ${connectedCount} ร้าน`
            : config.configured
              ? "ตั้งค่าแอปแล้ว · รอเชื่อมร้าน"
              : "ยังไม่ตั้งค่า"}
        </Badge>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-foreground">โหมด:</span>
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              {(["sandbox", "live"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setEnv(option)}
                  className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition-colors ${
                    env === option
                      ? "bg-slate-900 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "sandbox" ? "Sandbox (ทดสอบ)" : "Live (ใช้งานจริง)"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-foreground">
                {env === "sandbox" ? "Test Partner ID" : "Live Partner ID"}
              </span>
              <Input
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                placeholder="เช่น 1253520"
                inputMode="numeric"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-foreground">
                {env === "sandbox" ? "Test Partner Key" : "Live Partner Key"}
              </span>
              <Input
                type="password"
                value={partnerKey}
                onChange={(e) => setPartnerKey(e.target.value)}
                placeholder={
                  config.configured ? "ใส่เฉพาะเมื่อต้องการเปลี่ยน" : "ขึ้นต้นด้วย shpk..."
                }
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-foreground">
              Redirect URL Domain (ตรงกับที่ตั้งใน Shopee Console)
            </span>
            <Input
              value={redirectBaseUrl}
              onChange={(e) => setRedirectBaseUrl(e.target.value)}
              placeholder="เช่น https://revenue.goldpulse-ai.com (เว้นว่างเพื่อใช้โดเมนปัจจุบัน)"
            />
            {hostIsLocal ? (
              <span className="text-[11px] leading-relaxed text-muted-foreground">
                รันเครื่อง dev อยู่ — แนะนำใส่โดเมนที่ตั้งใน Test Redirect URL Domain ของ Shopee แล้วใช้ปุ่ม &ldquo;วาง Callback URL&rdquo; หลังกดยินยอม
              </span>
            ) : null}
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="min-h-[40px]"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก…" : "บันทึกค่า Shopee"}
            </Button>
            {config.configured ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                onClick={() => setEditing(false)}
              >
                ยกเลิก
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span>
              Partner ID: <strong className="text-foreground">{config.partnerId}</strong>
            </span>
            {config.redirectBaseUrl ? (
              <span className="break-all">
                Redirect: <strong className="text-foreground">{config.redirectBaseUrl}</strong>
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[40px]"
            onClick={() => setEditing(true)}
          >
            แก้ไข Credential
          </Button>
        </div>
      )}

      {accounts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => {
            const isConnected = account.status === "connected";
            const msg = actionResult[account.accountKey];
            return (
              <div
                key={account.accountKey}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-foreground">
                        {account.shopName || `Shopee #${account.accountKey}`}
                      </span>
                      <Badge variant={isConnected ? "success" : "danger"}>
                        {isConnected ? "พร้อมใช้งาน" : "มีข้อผิดพลาด"}
                      </Badge>
                      {account.region ? (
                        <Badge variant="neutral">{account.region}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Shop ID: {account.accountKey} · Token หมดอายุ{" "}
                      {formatDateTime(account.accessTokenExpiresAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => handleTest(account.accountKey)}
                      disabled={testingKey === account.accountKey}
                    >
                      {testingKey === account.accountKey ? "กำลังทดสอบ…" : "ทดสอบ"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => handleSyncNow(account.accountKey)}
                      disabled={syncingKey === account.accountKey}
                    >
                      {syncingKey === account.accountKey ? "กำลังซิงก์…" : "ซิงก์ทันที"}
                    </Button>
                  </div>
                </div>

                {account.lastError ? (
                  <p className="rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                    {account.lastError}
                  </p>
                ) : null}
                {msg ? (
                  <p className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                    {msg}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {config.configured ? (
        <>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button asChild size="sm" className="min-h-[40px]">
            <a href="/api/platform/shopee/authorize">
              {accounts.length > 0 ? "เพิ่ม / เชื่อมร้าน Shopee ใหม่" : "เชื่อมร้าน Shopee (OAuth)"}
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[40px]"
            onClick={() => setShowManual((v) => !v)}
          >
            {showManual ? "ซ่อนช่องวาง Callback" : "วาง Callback URL / Code (Dev)"}
          </Button>
          {connectedCount > 0 ? (
            <Button asChild variant="outline" size="sm" className="min-h-[40px]">
              <Link href="/platform?platform=shopee">เปิดดูแดชบอร์ด Shopee</Link>
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-xs font-semibold text-foreground">
            Callback URL สำหรับ Push ออเดอร์ — วางใน Shopee Console → Push Mechanism
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="mono min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 text-[11.5px]">
              {webhookUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[40px]"
              onClick={handleCopyWebhook}
            >
              คัดลอก
            </Button>
          </div>
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            ต้องเป็นโดเมนที่ Shopee เรียกถึงจากอินเทอร์เน็ต (ไม่ใช่ localhost) และ endpoint นี้ตรวจลายเซ็น
            HMAC ของ Shopee เองก่อนทำงาน
          </span>
        </div>
        </>
      ) : null}

      {showManual ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs">
          <p className="font-semibold text-foreground">
            กรณีทดสอบบนเครื่อง Dev แต่ Redirect กลับไปโดเมนจริง: คัดลอก URL จากแถบที่อยู่หลังกด Authorize มาวางที่นี่
          </p>
          <Input
            value={callbackUrl}
            onChange={(e) => setCallbackUrl(e.target.value)}
            placeholder="https://revenue.goldpulse-ai.com/api/platform/shopee/callback?code=...&shop_id=..."
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="หรือกรอก code เฉยๆ"
            />
            <Input
              value={manualShopId}
              onChange={(e) => setManualShopId(e.target.value)}
              placeholder="และ shop_id (ตัวเลข)"
              inputMode="numeric"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-[40px]"
              onClick={handleManualExchange}
              disabled={exchanging}
            >
              {exchanging ? "กำลังแลก Token…" : "ยืนยันเชื่อมร้าน"}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
