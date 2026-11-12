# แผน: หน้าใหม่ "ดึงข้อมูลตรงจากแพลตฟอร์ม" (Platform Sync)

> สถานะ: **ข้อเสนอ ยังไม่เริ่มเขียนโค้ด** · เขียน 12 พ.ย. 2026
> คำถามที่แผนนี้ตอบ: ทำแบบที่อัปไฟล์ Shipnity อยู่ทุกวัน แต่เปลี่ยนเป็นดึงจาก API ของ TikTok Shop / Shopee โดยแยกเป็นหน้าใหม่ ไม่แตะของเดิม — **ทำได้** และเพิ่มสถานะขนส่ง/ยกเลิก/คืนเงินเข้าไปด้วยได้ในชุดเดียวกัน

---

## 0. คำตอบสั้น

| คำถาม | คำตอบ | เหตุผล |
|---|---|---|
| ดึงออเดอร์ + สินค้า + ยอดเงิน จาก API แทนไฟล์ได้ไหม | **ได้** | TikTok: `order/202309/orders/search`, `finance/202309/statements`, `finance/202501/orders/{id}/statement_transactions` · Shopee: `order.get_order_list`, `payment.get_escrow_detail(_batch)`, `payment.get_income_detail` |
| ได้สถานะขนส่ง/ยกเลิก/คืนเงินไหม | **ได้** | Shopee `logistics.get_tracking_info`, `returns.get_return_list/detail` · TikTok `logistics` Get Logistics Tracking, `Search Returns`, `Search Cancellations` + webhook `PACKAGE_UPDATE` / `CANCELLATION_STATUS_CHANGE` / `RETURN_STATUS_CHANGE` |
| แยกหน้าใหม่โดยไม่กระทบของเดิมได้ไหม | **ได้** | เขียนลงตารางใหม่ `platform_*` + service ใหม่ ไม่แตะ `transactions` / `invoice_registry` / `listBills` / `daily_summaries` |
| อะไรคือตัว блокจริง | **สิทธิ์และบัญชี** ไม่ใช่ API | Shopee ต้องสร้าง app ประเภท Seller In-house System แล้ว Go Live (รีวิว ~24 ชม.) · TikTok ใช้ Custom App ของร้านเองได้ |
| อะไรที่ API ให้ไม่ได้ | ต้นทุนสินค้า/กำไรในสต็อก | ยังต้องมาจาก Shipnity → หน้าใหม่นี้ **ไม่แทนที่** ระบบบิล/ใบกำกับเดิม |

---

## 1. ขอบเขต: อะไรแตะ อะไรไม่แตะ

### ห้ามแตะ (ของเดิมต้องทำงานเหมือนเดิม 100%)
- `src/lib/ingest/import-service.ts` และ parser ทั้งหมด (`oms-parse.ts`, `parse.ts`, `shopee-parse.ts`, `lazada-parse.ts`)
- ตาราง `transactions`, `invoice_registry`, `invoice_registry_audit`, `daily_summaries`, `oms_orders`
- `src/lib/queries.ts` (listBills / getOverallStats / getDailyUploadCompleteness)
- หน้า `/import`, `/bills`, `/invoices`, `/days`, `/orders`

### แตะได้แบบ "เพิ่มอย่างเดียว" (additive)
| ไฟล์ | สิ่งที่เพิ่ม | ความเสี่ยง |
|---|---|---|
| `src/lib/db.ts` | ตาราง `platform_*` ต่อท้าย `SCHEMA_SQL` + bump `SCHEMA_VERSION` | ต่ำ — เป็น DDL เพิ่ม ไม่แก้ตารางเดิม; มีผลทั้ง schema `public` และ `seeheng` |
| `src/components/Sidebar.tsx` | เมนูใหม่ 1 รายการ | ต่ำ — เฟสแรกยังไม่ต้องใส่ก็ได้ เปิดด้วย URL ตรงก่อน |
| `tests/` | เทสต์ชุดใหม่ `platform-*.test.ts` | ไม่แตะเทสต์เดิม |

### ของใหม่ทั้งหมด
- `src/lib/platform/` — connector + sync service + ตัวแปลงสถานะ (แยกไฟล์ต่อแพลตฟอร์มตามกฎ Strict Platform Isolation)
- `src/app/platform/` — หน้าใหม่ (list + detail + ประวัติการดึง)
- `src/app/api/platform/` — API routes สำหรับกดเชื่อมต่อ/กดดึง/สถานะ

---

## 2. สถาปัตยกรรม (4 ชั้น)

```
┌──────────────────────────────────────────────────────────────┐
│ UI  /platform  — การ์ดร้านที่เชื่อม · ปุ่มดึง · ตารางออเดอร์ · ไทม์ไลน์สถานะ │
└───────────────▲──────────────────────────────────────────────┘
                │ (server actions / api routes, ต้อง login)
┌───────────────┴──────────────────────────────────────────────┐
│ SYNC SERVICE  syncShop({platform, shopId, kinds, range})       │
│  • แบ่งช่วงเวลา (Shopee ≤15 วัน) • cursor ต่อเนื่อง            │
│  • upsert แบบ idempotent • บันทึก platform_sync_runs           │
└───────────────▲──────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│ CONNECTORS (แยกไฟล์ ไม่ใช้โค้ดร่วมกันในการคำนวณเงิน)           │
│  tiktok.ts : sign(HMAC) · shop_cipher · order/finance/returns  │
│  shopee.ts : sign(HMAC-SHA256) · access_token 4 ชม. · order/   │
│              payment/returns/logistics                        │
└───────────────▲──────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│ NORMALIZER  platform_state_map : สถานะดิบของแต่ละเจ้า → ชุดกลาง │
│  shipping: pending | shipped | in_transit | delivered | failed │
│  sale    : paid | cancelled | return_requested | returned      │
│  money   : pending | released | adjusted                       │
└──────────────────────────────────────────────────────────────┘
```

> กฎที่ยึดตาม AGENTS.md: ทุกจุดที่คำนวณเงินต้องแยก `if (platform === 'TikTok') … else if (platform === 'Shopee') …` ห้ามเหมารวม และห้ามให้โค้ดของเจ้าไหนแก้ยอดของอีกเจ้า

---

## 3. ตารางใหม่ (schema ต่อบริษัท ตาม `search_path` เดิม)

| ตาราง | เก็บอะไร | คีย์กันซ้ำ |
|---|---|---|
| `platform_accounts` | credential ต่อร้าน: platform, shop_id, shop_cipher, access_token, refresh_token, expires_at, สถานะเชื่อม | `(platform, shop_id)` |
| `platform_sync_runs` | ประวัติการดึง: ชนิดข้อมูล, ช่วงวันที่, จำนวนแถว, ผล, error | `id` (identity) |
| `platform_orders` | ออเดอร์: เลขที่, สถานะออเดอร์, เวลาสั่ง/เวลาชำระ, ยอด, ผู้ซื้อ, ขนส่ง | `(platform, shop_id, order_id)` |
| `platform_order_items` | รายการสินค้า: sku, ชื่อ, จำนวน, ราคา, ส่วนลด | `(platform, shop_id, order_id, line_id)` |
| `platform_finance` | ยอดเงินต่อออเดอร์: payout, ค่าธรรมเนียม (jsonb), statement id, เวลาปล่อยเงิน | `(platform, shop_id, order_id)` |
| `platform_adjustments` | รายการหัก/คืนนอกออเดอร์ (Shopee wallet ADJUSTMENT_*, TikTok adjustment) | `(platform, shop_id, external_id)` |
| `platform_shipments` | tracking, สถานะขนส่งล่าสุด, เหตุการณ์ล่าสุด, เวลาอัปเดต | `(platform, shop_id, tracking_no)` |
| `platform_returns` | คำขอคืน/ยกเลิก: ประเภท, สถานะ, เหตุผล, ยอดคืน, ผู้ตัดสิน | `(platform, shop_id, case_id)` |
| `platform_state_map` | ตารางแปลงสถานะดิบ → ชุดกลาง (แก้ได้โดยไม่ต้อง deploy) | `(platform, kind, raw_state)` |

**หมายเหตุ:** ไม่มีการเขียนลง `transactions` ในทุกเฟสของแผนนี้ — จนกว่าจะผ่านการเทียบยอด (ข้อ 7) และมีคำสั่งแยกต่างหาก

---

## 4. แหล่งข้อมูล → ฟิลด์ที่ต้องได้

| ข้อมูลที่ระบบเดิมได้จากไฟล์ | TikTok Shop | Shopee |
|---|---|---|
| ออเดอร์ + ที่อยู่ + ขนส่ง | `POST /order/202309/orders/search` | `GET /api/v2/order/get_order_list` + `get_order_detail` |
| รายการสินค้า/SKU/จำนวน | `sku_list` ใน order detail + `statement_transactions.sku_transactions` | `items[]` ใน `get_escrow_detail` |
| ยอดขาย/ส่วนลด | `payment_info`, `revenue_breakdown` | `order_income.order_original_price`, `seller_discount`, `shopee_discount` |
| ยอดโอนสุทธิ (payout) | `settlement_amount` (statement + by order) | `order_income.escrow_amount` / `payment.get_income_detail.released_amount` |
| ค่าธรรมเนียมแยกรายการ | `fee_and_tax_amount` + breakdown | `commission_fee`, `service_fee`, `seller_transaction_fee`, `service_fee`… |
| ค่าส่งที่ร้านจ่าย / ที่ลูกค้าจ่าย | `shipping_cost_breakdown` | `actual_shipping_fee`, `buyer_paid_shipping_fee`, `final_shipping_fee` |
| รายการปรับปรุง (หัก/คืน) | statement `adjustment_amount` + transactions | `order_adjustment[]`, `get_wallet_transaction_list` (ADJUSTMENT_*) |
| **สถานะขนส่ง** | `logistics` Get Logistics Tracking, `package_status`, `tracking_number` | `logistics.get_tracking_info`, `order_trackingno_push` |
| **ยกเลิก** | `order_status=CANCELLED`, `cancel_reason`, `cancellation_initiator` | สถานะ `CANCELLED`, `buyer_cancel_reason` |
| **คืนเงิน/คืนสินค้า** | `Search Returns`, `Get Return Records` | `returns.get_return_list` + `get_return_detail` |
| **ลูกค้าปฏิเสธรับ** | `REVERSE_STATUS_UPDATE`, `Search Aftersales Request` | เหตุผลใน return + `order_adjustment` |

---

## 5. วิธีดึงข้อมูล (sync strategy)

1. **Trigger:** ปุ่ม "ดึงตอนนี้" บนหน้า `/platform` + ตัวตั้งเวลา (cron/route ที่เรียกซ้ำได้) รายชั่วโมงสำหรับสถานะ และรายวันสำหรับการเงิน
2. **Incremental:** เก็บ `last_synced_at` ต่อ `(platform, shop, kind)` ใน `platform_accounts`/`platform_sync_runs` แล้วดึงต่อจากจุดเดิม — ไม่ดึงซ้ำทั้งก้อน
3. **ช่วงเวลา:** Shopee ครั้งละ ≤ 15 วัน (order list, wallet, returns), income detail ≤ 14 วัน → วนเป็นช่วง; TikTok ตามที่ endpoint กำหนด + `page_token`
4. **Idempotency:** ทุกตารางมี unique key (ข้อ 3) + `ON CONFLICT DO UPDATE` — รันซ้ำไม่เกิดแถวซ้ำ
5. **Rate limit:** TikTok เป็นโควตาไดนามิก (แนะนำเริ่ม 3–10 req/s สำหรับ read, ถอยเมื่อเจอ 429/36009002) · Shopee page ละ ≤100 — ใช้คิวเดียวต่อร้าน ไม่ยิงขนาน
6. **Retry:** exponential backoff + jitter, เคารพ `Retry-After`, หยุดเมื่อ 5 ครั้ง
7. **Backfill:** ปุ่มแยก "ดึงย้อนหลัง 90 วัน" (TikTok มีข้อมูลการเงินตั้งแต่ 2023-07-01)
8. **Webhook (เฟส 3):** รับ `PACKAGE_UPDATE`, `CANCELLATION_STATUS_CHANGE`, `RETURN_STATUS_CHANGE` (TikTok) และ `order_status_push`, `order_trackingno_push`, `return_updates_push` (Shopee) เพื่อให้สถานะสด — ต้องมี HTTPS endpoint สาธารณะ; การเงินยังใช้การดึงเป็นหลักเพราะไม่มี webhook เรื่องเงิน

---

## 6. หน้าใหม่ `/platform` — สิ่งที่คนเห็น

1. **แถวบน:** การ์ดต่อร้าน (TikTok/Shopee) — สถานะเชื่อม, อายุ token, ปุ่มเชื่อม/ตัด, ปุ่ม "ดึงตอนนี้", ช่วงวันที่
2. **สรุป:** จำนวนออเดอร์ / ยอดโอนรวม / จำนวนที่มีปัญหา (ยกเลิก, คืนของ, ส่งไม่สำเร็จ) แยกตามแพลตฟอร์ม (ห้ามรวมข้ามแพลตฟอร์ม)
3. **ตารางออเดอร์:** ตัวกรองสถานะ (ทั้งหมด · กำลังส่ง · ส่งถึงแล้ว · ยกเลิก · ขอคืนเงิน · ลูกค้าปฏิเสธรับ) + ค้นหาเลขคำสั่งซื้อ
4. **รายละเอียดออเดอร์:** ไทม์ไลน์สถานะ + ตารางค่าธรรมเนียม + ยอดโอน + ลิงก์ไปหน้าบิลเดิม (ถ้ามีในระบบ)
5. **ประวัติการดึง:** ทุก run สำเร็จ/ล้มเหลว พร้อม error ให้กดดูได้ — เพื่อไม่ให้เกิด "เงียบ ๆ ไม่มีข้อมูล"
6. **มาตรฐาน UI:** shadcn/ui เท่านั้น, mobile-first ตรวจ 360/390/768/1280, ปุ่มแตะ ≥40px, ตารางบนจอเล็กเป็น card list

---

## 7. วิธีพิสูจน์ว่าถูก (ก่อนเชื่อตัวเลข)

1. **เทียบกับไฟล์เดิม 1 เดือน** — สคริปต์ใน `scripts/` อ่านฝั่งไฟล์ (ระบบนำเข้าเดิม) กับฝั่ง API แล้วเทียบ `payout` ต่อออเดอร์: ต้องตรง 100% หรือมีรายการอธิบายได้ครบ
2. **รายงานผลต่าง** — หน้า/ไฟล์สรุป: จำนวนออเดอร์ที่ตรง, ไม่ตรง, หาไม่เจอทั้งสองฝั่ง
3. **เทสต์อัตโนมัติ** — mock response ต่อ connector (ทุกกรณี: ปกติ/ติดลบ/ยกเลิก/คืนของ), normalize สถานะ, idempotency (รันซ้ำแล้วไม่เพิ่มแถว), rate-limit retry
4. **ไม่แตะ production** — รันเฉพาะเครื่อง dev + ฐานข้อมูล dev ก่อน; การขึ้นเซิร์ฟเวอร์จริงเป็นการตัดสินใจแยก
5. **เกณฑ์ผ่าน:** ตรง ≥ 99.5% ของออเดอร์ในเดือนที่ทดสอบ และยอดรวมต่าง ≤ 0.1%

> ผลพลอยได้: ตัวเทียบนี้เองคือเครื่องมือที่ใช้ตรวจว่า Shipnity กับแพลตฟอร์มตรงกันหรือไม่ ซึ่งเป็นเหตุผลเดิมที่อยากเลิกใช้ไฟล์

---

## 8. เฟสงาน (ทุกตัวเลขเป็นการประเมิน ยังไม่ได้วัดจากการลงมือ)

| เฟส | งาน | ประมาณ |
|---|---|---|
| 0 | ขอสิทธิ์ + เก็บ credential + ยิง API จริง 1 ร้าน ให้เห็นข้อมูลจริง | 1–2 วัน (รอรีวิว Shopee ~24 ชม.) |
| 1 | Shopee connector + ตาราง `platform_*` + หน้า `/platform` อ่านอย่างเดียว | 3–5 วัน |
| 2 | TikTok connector (order + finance) | 3–5 วัน |
| 3 | สถานะขนส่ง/ยกเลิก/คืนเงิน + ไทม์ไลน์ + webhook | 3–4 วัน |
| 4 | เทียบยอดกับไฟล์ + รายงานผลต่าง + เทสต์ครบ | 2–3 วัน |

รวมประมาณ **12–19 วันทำการ** (ไม่รวมเวลารอรีวิว/เอกสารจากแพลตฟอร์ม)

---

## 9. ความเสี่ยงและสิ่งที่ยังไม่รู้

| เรื่อง | สถานะ |
|---|---|
| ใครถือบัญชี developer ของ Shopee/TikTok | **ยังไม่รู้ — ต้องตัดสินใจ** |
| Shopee ต้อง Go Live (รีวิว) ก่อนใช้ production | รู้แล้ว (เอกสาร App management) |
| Shopee access token อายุ 4 ชม. → ต้องมีตัว refresh | รู้แล้ว ต้องออกแบบ job |
| TikTok ต้องมี `shop_cipher` ต่อร้าน | รู้แล้ว (common parameter) |
| SKU บนแพลตฟอร์มตรงกับรหัสสินค้าใน Shipnity ไหม | **ยังไม่ตรวจ — ต้องดูข้อมูลจริง** |
| TikTok ไม่มี webhook เรื่องเงิน / statement ออกวันละครั้ง | รู้แล้ว — ออกแบบให้การเงินเป็นรอบรายวัน |
| ข้อมูลย้อนหลัง: TikTok ตั้งแต่ 2023-07-01 | รู้แล้ว |
| ต้องเข้ารหัส token ใน DB หรือไม่ | ยังไม่ตัดสิน (ปัจจุบัน `app_settings` เก็บ plaintext) |

---

## 10. สิ่งที่ต้องตัดสินใจก่อนเริ่ม (3 ข้อ)

1. **เริ่มร้าน/บริษัทไหนก่อน** — แนะนำบริษัทที่มีไฟล์เดือนล่าสุดครบ (ใช้เทียบยอดได้ทันที)
2. **ใครเป็นผู้ถือบัญชี developer + ผู้กด authorize** (Shopee ต้องมีบัญชี seller ที่เป็นแอดมินร้าน)
3. **เมนูใหม่ชื่ออะไร / วางตรงไหน** — หรือเฟสแรกเปิดด้วย URL `/platform` เฉย ๆ ก่อน (ไม่แตะ Sidebar)

---

## 11. สิ่งที่แผนนี้ **ไม่** ทำ

- ไม่เปลี่ยนแหล่งที่มาของยอดที่ใช้ยื่นภาษี (ยังเป็นไฟล์/ระบบเดิม)
- ไม่ลบหรือแก้บิล/ใบกำกับที่ออกไปแล้ว
- ไม่แทนที่ Shipnity ในเรื่องต้นทุนสินค้าและสต็อก
- ไม่แตะหน้า `/orders` (แพ็คของ) ซึ่งใช้ Shipnity API อยู่แล้ว

---

## 12. ความปลอดภัยของ credential (ทำแล้ว 12 พ.ย. 2026)

**เข้ารหัสก่อนเก็บ (ทำเสร็จ)**
- `src/lib/platform/secrets.ts` — AES-256-GCM, คีย์ `PLATFORM_SECRET_KEY` (base64 32 ไบต์) อยู่ใน `.env` เท่านั้น ไม่อยู่ใน DB
- ค่าที่บันทึกมี prefix `v1:` — ค่าเก่าที่เป็นข้อความธรรมดายังอ่านได้ และจะถูกเข้ารหัสทับอัตโนมัติเมื่ออ่านครั้งแรก (ตรวจแล้ว: `public` = `encrypted=true`)
- production จะ **ปฏิเสธการบันทึก** credential ถ้ายังไม่มีคีย์ (`src/lib/platform/store.ts`)
- ข้อความ error ทุกจุดถูกตัด `app_secret` / `auth_code` / `refresh_token` ก่อน log หรือใส่ URL
- ตรวจสถานะได้ด้วย `npx tsx --env-file=.env scripts/check-platform-secret.ts`

**จำกัดสิทธิ์เข้าถึง (ต้องทำบนเซิร์ฟเวอร์ — ยังไม่ได้ทำ)**
1. **เปลี่ยนรหัส `postgres`** ของ DB ที่แชร์กับ Supabase แล้วเก็บเฉพาะใน `.env` ของเซิร์ฟเวอร์ (รหัสเดิมอยู่ใน `.env` เครื่อง dev)
2. **ปิดพอร์ต 5432 ไม่ให้รับจากทั้งเครือข่าย** — ให้ผูกกับ `127.0.0.1` หรือ Tailscale interface เท่านั้น (ปัจจุบัน Docker เปิด `0.0.0.0:5432`; compose ของ DB อยู่ที่โปรเจกต์ Supabase ไม่ใช่ repo นี้)
3. **สร้าง role สำหรับแอป** (ไม่ใช้ `postgres`) ให้สิทธิ์เฉพาะ database `pcms_revenue` + schema ที่ใช้ แล้วเปลี่ยน `DATABASE_URL` ของแอป
4. **หมุน (rotate) App Secret ของ TikTok** ใน Partner Center — ค่าเดิมเคยถูกเก็บเป็นข้อความธรรมดาในช่วงสั้น ๆ
5. **backup ของ DB** (`C:\deploy\backups` / `Documents\GitHub\db-backups`) มีค่า credential ติดไปด้วย — ต้องจำกัดสิทธิ์ไฟล์และเก็บแยกจากเครื่องที่ใช้งานทั่วไป

---

## 13. สถานะจริงและบันทึกส่งต่อ (ณ 12 พ.ย. 2026)

### ฝั่ง TikTok ที่ทำไปแล้ว
- แอป **PCMS Revenue** สร้างใน Partner Center แล้ว: ประเภท **Custom**, หมวด **Seller inhouse developer / TikTok Shop Seller**, ตลาด **Thailand / Local sellers**, เปิด API
  - **Service ID (= App ID): `7706978520091232018`** · **App key: `6lsssud4rl5us`** · App secret: อยู่ใน Partner Center (กด Manage app secret) และบันทึกไว้ในหน้า `/settings` ของระบบแล้ว
  - Redirect URL ที่ตั้งในแอป: `https://revenue.goldpulse-ai.com/api/platform/tiktok/callback`
  - สถานะแอป: **Draft** — ปุ่ม Publish ถูกบล็อกด้วย checklist "Partner registration review"
- **ลงทะเบียน partner ส่งแล้ว 12 พ.ย. 2026 15:18** → สถานะ **Under review** (3–5 วันทำการ)
  - Partner name: `Dragon19` · บริษัท: บริษัท ดราก้อน 19 จำกัด · ทะเบียน `0655566003499` · ที่อยู่ 27/54 ถนนเอกาทศรฐ ต.ในเมือง อ.เมืองพิษณุโลก จ.พิษณุโลก · ช่วงทะเบียน: Permanent
  - แนบหนังสือรับรองบริษัท **เฉพาะหน้าแรก** (ไฟล์อยู่ `C:\Users\Dev-dragon19\Desktop\เอกสารบริษัท\หนังสือรับรอง 12.11.69_page-0001_0.jpg` — มี 5 หน้า ถ้ารีวิวขอเพิ่มให้กด Edit แล้วเพิ่มหน้า 2–5)
  - หมายเหตุ: กด Submit ครั้งแรกขึ้น "Something went wrong" ของ AI pre-check → กด **Retry** แล้วผ่าน

### ฝั่งระบบเรา (อยู่บน production แล้ว)
- หน้า `/platform` (สรุปสถานะ + แท็บ ออเดอร์/ประวัติ) และ `/settings` แท็บ "เชื่อมต่อแพลตฟอร์ม"
- API: `GET/POST /api/platform/tiktok/config`, `GET /authorize`, `GET /callback`, `POST /test`
- ตาราง `platform_accounts` (schema v55 ทั้ง `public` และ `seeheng`) · credential เข้ารหัส AES-256-GCM (`PLATFORM_SECRET_KEY`)
- เทสต์: `tests/platform-tiktok.test.ts` (8) + `tests/platform-secrets.test.ts` (6)

### บทเรียนการ deploy (สำคัญ)
- บนเซิร์ฟเวอร์ docker compose อ่าน **`C:\Users\DEV\Documents\GitHub\PCMS_Revenue\docker-compose.yml` + `.env`** (ไม่ใช่ `C:\deploy`)
- สคริปต์ deploy ข้ามการสร้าง container ใหม่เมื่อ **ไม่มี commit ใหม่** → env ที่แก้ใน `.env` จะไม่ถูกอ่านจนกว่าจะมี commit หรือสั่ง `docker compose up -d app` เอง
- เครื่องมือของ session เข้า path บนเซิร์ฟเวอร์ไม่ได้ (ถูกกั้น) → งานที่ต้องแก้ `.env` บนเซิร์ฟเวอร์ต้องให้ผู้ใช้รันเอง

### ค้างอยู่ / ลำดับถัดไป
1. รอผลรีวิว partner (3–5 วันทำการ) → กด **Publish** แอป → ได้ Authorize link
2. เชื่อมร้าน (บัญชี seller แรก) → ทดสอบ "ดึง Statement" ในหน้า `/settings`
3. เชื่อมบัญชี seller ที่สอง (บริษัทเดียวกัน) — ถ้าหมวด Seller inhouse ไม่ยอมให้ authorize บัญชีที่สอง ให้สร้างแอปที่ 2 ใต้ partner เดิม (เอกสารชุดเดิม)
4. Shopee: ต้องเช็กก่อนว่าร้านเป็น **Mall หรือ Managed** (เงื่อนไขของ TH) ถ้าไม่ใช่ → ทางเลือก ISV หรือคงใช้ไฟล์ Income
5. งานปรับความปลอดภัยที่ยังไม่ทำ: rotate App Secret หลัง publish · เปลี่ยนรหัส postgres · ผูกพอร์ต 5432 กับ localhost/Tailscale · สร้าง role แอป (ดู §12)

### อัปเดตท้ายวัน 12 พ.ย. 2026 (16:10)

- **Partner registration: Approved 15:26** (เร็วกว่าที่ระบบแจ้ง 3–5 วัน)
- **แอป Publish แล้ว สถานะ "On"**
- **Scope ที่เปิด (Active 6):** Finance Information · Fulfillment Basic · Logistics Basic · Product Basic · Global Shop Information · Shop Authorized Information
  - หมายเหตุ: `Shop Authorized Information` อยู่ท้ายรายการ 31 ตัว (ต้องเลื่อนถึงจะเห็น) และเป็น scope ของ endpoint `/authorization/202309/shops`
- **ร้านที่ authorize: Kissi Studio · Shop ID 7495390224773123065** (สิทธิ์แบบไม่จำกัดเวลา, grant 15:37 และ re-grant 16:0x)
- **ยังค้างที่จุดเดียว:** callback แลก token ผ่าน แต่ `GET /authorization/202309/shops` ตอบ `Access denied. This app has not been granted any access scope required by this endpoint…` → ไม่มีร้านถูกบันทึกลง `platform_accounts`
  - แก้ไปแล้ว: redirect ที่เคยไป `https://0.0.0.0:3000` (ใช้ `x-forwarded-host`), แยกข้อความ error เป็น `token:` / `shops:`
  - เอกสาร TikTok ระบุให้เทียบ scope ของ endpoint กับ **`granted_scopes` ของ token**; สมมติฐานที่ยังไม่ปิด: token อาจยังไม่รับ scope ใหม่ (รอ/authorize ใหม่) หรือ endpoint ต้องใช้ scope อื่น
  - ขั้นต่อไป: (1) รอ ~30 นาทีแล้ว authorize ซ้ำ หรือ (2) log `granted_scopes` ของ token เพื่อพิสูจน์ หรือ (3) เปิด ticket กับ TikTok
- **Shopee:** ยังไม่เริ่ม — ติดเงื่อนไข TH (Mall/Managed seller) และยังไม่ได้สมัคร developer account
