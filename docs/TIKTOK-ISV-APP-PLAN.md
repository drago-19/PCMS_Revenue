# แผน B — สร้างแอป TikTok ใหม่หมวด ISV ใช้แทนแอปเดิม (ร้านได้มากกว่าหนึ่ง)

## 1. ทำไมต้องทำ

แอปเดิม `PCMS Revenue` (service_id `7706978520091232018`) อยู่หมวด `App developer / Seller inhouse developer / TikTok Shop Seller` ซึ่ง TikTok ระบุว่า **Private App ผูกได้หนึ่งร้านเท่านั้น** (ร้านของเจ้าของเอง) — ข้อ 4 ในหน้า *Common Error for Seller Developer* ของ Partner Center จึงมีร้านที่สองไม่ได้ไม่ว่าจะกดกี่ครั้ง

ทางแก้ที่ TikTok แนะในข้อความเดียวกันคือ **สร้างแอปในหมวดอื่นที่ไม่ใช่ seller in-house** แล้วให้ร้านกด authorize ใหม่ (ข้อ 9 ของหน้าเดียวกัน: ดูแลสองแอป หรือย้ายร้านเดิมมาใช้แอปใหม่)

เลือก "ย้ายมาใช้แอปใหม่ทั้งสองร้าน" เพราะระบบเราเก็บรหัสแอปได้ชุดเดียว — ใช้แอปชุดเดียวจึงไม่ต้องแก้โค้ด (`src/lib/platform/store.ts:167`, `src/lib/platform/run-sync.ts:62`, `src/lib/platform/stock.ts:93`)

## 2. ก่อนสร้างแอป: บัญชีต้องเป็นประเภท App developer (ISV)

ตรวจใน Partner Center เมื่อ 20 พ.ย. 2026 ด้วยบัญชี Dragon19 (Partner ID `7496238051482176505`):

- เมนูบัญชีแสดงประเภท **TikTok Shop seller** และหน้า *Create app & service* มีหมวดให้เลือกเพียง `Seller inhouse developer`
- หน้า **Add categories → Business category** แสดง `App developer` เป็นสีเทา กดไม่ได้ (ตัวที่กดได้: `Affiliate partner`, `MCN/CAP`, `TikTok Shop Partner (TSP)`)

เหตุผลอยู่ในเอกสาร *Developer onboarding* ของ TikTok: **ถ้าสมัครด้วยอีเมลของบัญชีร้าน ระบบจะมองว่าเป็นผู้ขาย และสมัครได้แค่ seller developer** — ต้องสร้างบัญชี Partner Center ใหม่ที่ `https://partner.tiktokshop.com/account/sign-up` ด้วยอีเมลที่ไม่ใช่ของบัญชีร้าน เลือก *For app developers (ISV)* กรอกข้อมูลบริษัท + แนบหนังสือรับรอง แล้วติดตามสถานะที่ My Account > My category & market

แอปที่สร้างจากบัญชีใหม่นี้ไม่ผูกกับร้านใดร้านหนึ่ง ร้านไหนก็ authorize ได้ — หลังจากนั้นทำตามข้อ 3 เป็นต้นไป

### ทางเลือกที่ TikTok เปิดไว้: ขอยกเว้นให้บัญชีเดิม (allowlist)

เอกสาร *Developer onboarding* เขียนไว้ว่า ถ้าบัญชีใช้ email ของร้านและต้องการสมัครเป็น ISV ให้ **"submit a ticket or contact your Account Manager (AM) to request allowlisting before continuing the registration process"** — คือขอยกเว้นแล้วสมัครต่อจากบัญชีเดิมได้ ไม่ต้องมีบัญชีที่สอง (แต่ขึ้นกับว่า TikTok อนุมัติหรือไม่)

ช่องทาง: ปุ่มลอยมุมขวาล่างของทุกหน้า Partner Center หรือ **Help → Ask Partner Assistant** → พิมพ์ปัญหา → **Submit a Ticket** (เอกสารระบุตอบกลับภายใน 24 ชั่วโมงทำการ แก้ไขภายใน 48 ชั่วโมงทำการ)

ข้อความยื่นเรื่อง (คัดลอกไปวาง):

```
Title: Allowlist request — register as App Developer (ISV) from our seller account

Partner Center ID: 7496238051482176505 (Dragon19)
Company: Dragon19 Co., Ltd. (บริษัท ดราก้อน 19 จำกัด), Thailand, registration no. 0655566003499

Our Partner Center account was registered with the email of our TikTok Shop seller account, so the
account type is "TikTok Shop seller". In App & Service > Create app & service only the category
"Seller inhouse developer" is selectable, and in Add categories > Business category the option
"App developer" is greyed out.

What we need: to register as App Developer / system integrator (ISV) for Thailand, business category
eCommerce Management (Multi-Channel Management), and create a Custom app that several of our own
shops can authorize. Our current app (Service ID 7706978520091232018, category "Seller inhouse
developer") is limited to one shop, so a second shop cannot authorize it.

Request: please allowlist this account so we can continue the ISV registration from the same account,
or confirm whether a new Partner Center account with a non-shop email is required.

Attached: company registration certificate.
```

**ยื่นแล้ว 20 พ.ย. 2026 13:43 — Ticket ID `2026112006120200006`** (สถานะ Unassigned)

- หมวดที่ใช้: `Appeal` — เพราะในบัญชีนี้หมวด `Account`, `Service`, `Others` ถูกปิด (สีเทา) และ `Developer Tool` มีแต่ API Call/Sandbox/API Testing
- ผูก "Service related" กับแอป PCMS Revenue (Service ID 7706978520091232018)
- ไม่แนบไฟล์: หน้าเว็บเตือนไม่ให้แนบไฟล์ที่มีข้อมูลส่วนบุคคล และหนังสือรับรองบริษัทอยู่ใต้ Partner ID นี้แล้ว จึงอ้างในเนื้อตั๋วแทน
- ติดตามที่ Help → View my tickets · เอกสารระบุตอบกลับภายใน 24 ชั่วโมงทำการ
- ข้อความแรกในตั๋วถูกแปลงอักขระพิเศษ (`"` → `&#34;`, `>` → `&gt;`) และบรรทัดใหม่หาย — เพิ่มข้อความที่ 2 เวลา 14:52 แบบข้อความล้วน ไม่มีอักขระพิเศษ (485/500 ตัวอักษร) แทน
- **26 พ.ย. 2026 11:51 TikTok ปฏิเสธคำขอ allowlist** — "Our review team has confirmed that you do not meet the criteria for adding to the whitelist" และแนะนำให้ใช้ **อีเมลใหม่สมัคร ISV onboarding ใหม่ในโหมด incognito** → ทางลัด (ใช้บัญชีเดิม) ปิด เหลือทางเดียวคือแผน B ในเอกสารนี้ (ต้องมีอีเมลที่ไม่ใช่ของบัญชีร้าน ซึ่งเป็นสิ่งที่ทีมเราต้องเตรียมเอง)
- ช่อง "Last updated" บนหัวตั๋วยังค้างที่ 21 พ.ย. 16:11 แม้มีข้อความใหม่ 26 พ.ย. — ช่องนี้ไม่ขยับตามข้อความของเจ้าหน้าที่ อย่าใช้ตัดสินว่ามีคำตอบหรือยัง ให้ดูท้าย Communication history

## 3. ค่าที่กรอกตอนสร้างแอป (Partner Center → App & Service → Create app & service)

| ฟิลด์ | ค่าที่ใช้ | เหตุผล |
|---|---|---|
| App type | **Custom** | ไม่ต้องลง App Store และไม่ต้องส่งรีวิว listing — แชร์ลิงก์ authorize ให้เฉพาะร้านของเรา (เอกสาร *Create your App*: "Custom app … not listed publicly") |
| Service category | **eCommerce Management → Multi-Channel Management** | ตรงกับงานจริง (ซิงก์สินค้า/สต็อก/ออเดอร์ข้ามช่องทาง) และ**ไม่ใช่ Connector** ซึ่งบังคับส่งรีวิวแอป |
| Default name | `PCMS Revenue` | ชื่อเดิม ร้านจำได้ |
| Logo | ยังไม่ต้อง | ไม่บังคับสำหรับ custom app |
| Market | **Thailand** | ร้านทั้งหมดอยู่ TH |
| Seller type | **Local** | ผู้ขายในประเทศ (ไม่ใช้โฟลว์ cross-border) |
| Enable API | เปิด | ต้องเรียก Open API |
| Redirect URL | `https://revenue.goldpulse-ai.com/api/platform/tiktok/callback` | ตรงกับ route ที่มีอยู่แล้ว (`src/app/api/platform/tiktok/callback/route.ts`) |
| Webhook URL | `https://revenue.goldpulse-ai.com/api/platform/tiktok/webhook` | ตรงกับ route ที่มีอยู่แล้ว (`src/app/api/platform/tiktok/webhook/route.ts`) |

> หลังกดสร้าง ระบบจะเข้าคิว **Partner registration review ต่อหมวด** (หน้าแรกของ Partner Center ระบุ 3–5 วันทำการ) — ต้องแนบหนังสือรับรองบริษัทชุดเดิม (`Desktop\เอกสารบริษัท\หนังสือรับรอง 12.11.69_page-0001_0.jpg` และหน้า 2–5 ถ้าขอเพิ่ม)

## 4. ข้อความภาษาอังกฤษสำหรับช่องที่ต้องกรอก

**Short description (ไม่เกิน 200 ตัวอักษร)**

```
PCMS Revenue imports TikTok Shop orders, products, stock and daily settlement statements into our ERP, reconciles payouts and fees, and keeps inventory in sync with each shop.
```

**Key benefits**

```
- Orders, products and daily settlement statements land in the ERP without manual file imports.
- Payout, fees and revenue per order stay reconciled against TikTok Shop statements.
- Stock levels are read from and written back to the shop, so overselling is caught once.
```

**Detailed description**

```
PCMS Revenue is our company's internal ERP for seller finance and stock. The app connects a TikTok
Shop seller account to that system.

What it does:
- Reads orders, order items, packages, return/refund requests, products and stock from the authorized shop.
- Reads daily settlement statements and statement transactions, so payout, revenue, fees and taxes per
  order can be reconciled and used for VAT invoices.
- Writes stock quantity back to the shop for SKUs that are managed in our warehouse.
- Receives webhook events for order, cancellation, return and recipient-address changes.

How the data is used: figures are stored in our own database and shown only to our staff. Nothing is
resold or shared with third parties, and no buyer contact data leaves the system.

Seller prerequisites: an active TikTok Shop seller account in Thailand, and a stock-managed product list
on our side. Authorization can be cancelled by the seller at any time from Seller Center > App Store >
My apps and incidents; tokens are then deleted.

Limits: the app does not create listings or run promotions; it does not send messages to buyers.
```

**Integrations**

```
Shipnity (order file import), Shopee Open Platform, TikTok Shop Open API
```

**Contact information**

```
บริษัท ดราก้อน 19 จำกัด · 27/54 ถนนเอกาทศรถ ต.ในเมือง อ.เมืองพิษณุโลก จ.พิษณุโลก · ทะเบียน 0655566003499
อีเมลติดต่อ: <ต้องกรอก — ยังไม่มีอีเมลกลางของบริษัทในระบบ>
```

## 5. สิทธิ์ (scope) ที่ต้องเปิดบนแอปใหม่ — ให้ครบชุดเดิม

`Finance Information` · `Fulfillment Basic` · `Logistics Basic` · `Product Basic` · `Global Shop Information` · `Shop Authorized Information`

- `Shop Authorized Information` เป็นตัวที่ทำให้ `GET /authorization/202309/shops` ผ่าน — เคยลืมแล้วร้านบันทึกไม่ได้ (`docs/PLATFORM-API-SYNC-PLAN.md:245`)
- หลังเปิด scope ต้องรอให้ฝั่ง TikTok มีผลก่อนกด authorize ใหม่ (รอบแรกที่ล้มเหลวเคยเกิดก่อนสิทธิ์มีผล ~40 นาที — `docs/PLATFORM-API-SYNC-PLAN.md:258`)
- ถ้าหมวดที่เลือกไม่มี scope ตัวใดในรายการนี้ ให้เปลี่ยนหมวด ISV ที่มีครบ (เช่น `Finance → Accounting`) ก่อนกดสร้าง เพราะหมวดเปลี่ยนทีหลังไม่ได้

## 6. ลำดับขั้นสลับมาใช้แอปใหม่

1. สร้างแอปตามข้อ 3 → กรอก Redirect/Webhook ตามตาราง
2. รอผลรีวิวหมวด → กด Publish จนสถานะเป็น On
3. เปิด scope 6 ตัวตามข้อ 5 → รอราว 30 นาที
4. คัดลอก App Key / App Secret / Service ID ของแอปใหม่ → หน้า `/settings` ของเรา → กรอกทั้งสามช่องแล้วบันทึก (`src/components/TikTokConnectCard.tsx:113-129`)
5. กดเชื่อมร้านที่ 1 (Kissi Studio) → ร้านกด Approve → กลับมาที่ `/platform?tiktok=connected`
6. กดเชื่อมร้านที่ 2 ด้วยบัญชีหลักของร้านนั้น (บัญชีย่อย authorize ไม่ได้)
7. ถ้ายังต้องใช้ร้านทดสอบ: สร้าง Development shop ของแอปใหม่ใน Partner Center แล้ว authorize จากที่นั่น (โฟลว์นี้ไม่มี state ของเรา — `src/app/api/platform/tiktok/callback/route.ts:42-45`)
8. กดลงทะเบียน webhook ใหม่จากหน้า `/settings` (`/api/platform/tiktok/register-webhook`) — การสมัครเดิมทำด้วยโทเคนของแอปเก่า พอสลับแอปแล้วต้องสมัครซ้ำรายร้าน

**ช่วงที่ระบบจะเรียก TikTok ไม่ได้:** ตั้งแต่ขั้น 4 ถึงขั้น 5 ร้านที่ผูกไว้ยังถือโทเคนของแอปเก่า คำขอทั้งหมดจะถูกปฏิเสธ และ webhook ที่เข้ามาจะตรวจลายเซ็นไม่ผ่าน (`src/lib/platform/tiktok.ts:875-892` ใช้ app_key + app_secret ของแอปปัจจุบัน) — ควรทำขั้น 4–8 ในรอบเดียว และเลี่ยงเวลาที่มีคนใช้หน้าออเดอร์

**ย้อนกลับได้:** แอปเดิมไม่ถูกลบ ใส่รหัสแอปเดิมกลับในหน้า `/settings` ได้ แต่ร้านต้องกด authorize ใหม่กับแอปเดิมอีกรอบ

## 7. ตรวจว่าสำเร็จ

- `/settings` แสดงสองร้านในแท็บเชื่อมต่อแพลตฟอร์ม สถานะ connected
- ปุ่มทดสอบของแต่ละร้านดึง Statement ผ่าน (เดิม Kissi ได้ 200 OK · 5 statement / 30 วัน)
- หน้า `/platform` มีข้อมูลออเดอร์ของทั้งสองร้าน และไม่ขึ้นแถบ error
- ตาราง `platform_accounts` มีสองแถวที่ `shop_id` ตรงกับร้านจริง และคอลัมน์ `granted_scopes` มีครบทั้ง 6 ตัว (ดูก่อนสลับแอปแล้วเทียบกับหลังสลับ — ชื่อ scope ที่ TikTok คืนมาเป็นตัวตัดสินว่าเปิดครบจริง)

## 8. ยังไม่มี / ต้องตัดสินใจก่อนกดสร้าง

- **อีเมลสำหรับบัญชี App developer ใหม่** — ต้องไม่ใช่อีเมลของบัญชีร้าน (ข้อ 2) และควรเป็นอีเมลกลางของบริษัทที่รับจดหมายได้จริง
- **อีเมลติดต่อสำหรับแอป** — ยังไม่มีอีเมลกลางของบริษัทในระบบ ต้องเลือกว่าจะใช้อันไหน
- **หน้า Privacy/Terms สาธารณะ** — โปรเจกต์ยังไม่มี (`src/app` ไม่มี route ใดชื่อ privacy/terms) ถ้าแบบฟอร์มรีวิวบังคับ ต้องทำหน้าใหม่บน `revenue.goldpulse-ai.com` ก่อนยื่น
- **หน้า demo สำหรับผู้ตรวจ** — มีอยู่แล้วที่ `https://demo.goldpulse-ai.com` (บัญชี `shopee.review`, ข้อมูลสมมติ 6 ออเดอร์ — `docs/DEMO-REVIEW-SETUP.md`) ใช้เป็น URL ให้ผู้ตรวจเข้าได้ถ้าถูกขอ

## 9. ข้อมูลกรอกหน้าสมัคร Partner Center ใหม่ (ISV) — ใช้ข้อมูลบริษัทชุดเดิม

สมัครที่ `partner.tiktokshop.com/account/sign-up` ในหน้าต่างไม่ระบุตัวตน (โหมด incognito) — ต้องไม่มี session ของบัญชี Dragon19 เดิมค้างอยู่ ไม่งั้นจะเด้งกลับหน้า home ของบัญชีเดิม

| ฟิลด์ | ค่า |
|---|---|
| Email | **อีเมลใหม่ที่ไม่ใช่ของบัญชีร้าน** (รอจาก Dev) — เอกสาร *Developer onboarding*: ใช้อีเมลบัญชีร้านแล้วระบบจะมองเป็น seller developer |
| Phone | ไม่บังคับ (ใส่เบอร์บริษัทได้) |
| Registration region | **Thailand** — ต้องตรงกับหนังสือรับรองบริษัท |
| Target market | **Thailand** (local partner เลือกตลาดตัวเองเท่านั้น) |
| Business category | **App developer (ISV)** → เลือกหมวดย่อยที่มี scope ครบ 6 ตัวตามข้อ 5 |
| Company name | Dragon19 Co., Ltd. (บริษัท ดราก้อน 19 จำกัด) |
| Company registration no. | 0655566003499 |
| Business certificate | `Desktop\เอกสารบริษัท\หนังสือรับรอง 12.11.69_page-0001_0.jpg` (+ หน้า 2–5 ถ้าระบบขอ) |
| ที่อยู่ / ผู้ติดต่อ / เบอร์ | ต้องกรอกเอง — ไม่มีบันทึกไว้ในโปรเจกต์ |

ติดตามผลที่ **My Account > My category & market** · หลังอนุมัติจึงไปต่อข้อ 3 (สร้างแอป) แล้วเข้า compliance & legal review (เอกสารระบุ US/UK บังคับ 3 สัปดาห์ขึ้นไป ประเทศอื่นพิจารณารายกราย)

## 10. สถานะจริงหลังสมัครบัญชีใหม่ (27 พ.ย. 2026)

| รายการ | ค่า |
|---|---|
| Partner Center ใหม่ | ID `7495069626384221448` · Partner name **`Dragon19_ISV`** (ชื่อ `Dragon19` ซ้ำกับบัญชีเดิม) · อีเมล `d***v@gmail.com` |
| หมวด/ตลาด | App developer / eCommerce Management / Multi-Channel Management · Thailand |
| Partner registration | ส่ง 27 พ.ย. 2026 10:08 → **Approved 10:30 วันเดียวกัน** (เร็วกว่ากำหนด 3–5 วันทำการ) |
| แอป | `PCMS Revenue` · Service ID `7712411784523384584` · App key `6m1pt6150hq2n` · สถานะ **On (publish แล้ว 27 พ.ย. 10:34)** — โหมด beta จำกัด 25 ผู้ใช้ authorize |
| Scope | Active 12: product.basic, product.write, order.info, return_refund.basic, finance.info, fulfillment.basic, logistics, authorization.info, shop.info, live data, shop analytics, bestsellers (ไม่เปิด product.delete และ global_product*) |
| Webhook | `https://revenue.goldpulse-ai.com/api/platform/tiktok/webhook` · หัวข้อ Order Status Change, Reverse Status Update, Recipient Address, Package Update, Product Status Change, Seller Deauthorization, Auth Expire |
| ข้อมูลบริษัทที่กรอก | บริษัท ดราก้อน 19 จำกัด · 0655566003499 · 27/54 ถนนเอกาทศรฐ ตำบลในเมือง อำเภอเมืองพิษณุโลก จังหวัดพิษณุโลก · กรรมการ นางกรกนก มือนันต์ · ทุน 2,000,000 บาท (อ่านด้วย Tesseract `-l tha` แล้ว ให้ Dev ยืนยัน) |

**สถานะใช้งานจริง (27 พ.ย. 2026):** แอป publish เป็น `On` แล้ว (ตลาด Thailand · Beta Testing = cap 25 ร้าน) · prod เปลี่ยน `app_settings.platform_api` เป็น app key ใหม่ `6m1pt6150hq2n` เมื่อ 10:42 · ร้าน Kissi authorize แอปใหม่แล้ว 10:49 (token ถึง 4 ธ.ค. 2026) · ซิงก์กลับมาสำเร็จ (รอบ 10:49:46 done 26 แถว) — ระหว่าง 10:42–10:49 ซิงก์ล้มด้วย `access token does not match the app_key` ตามคาด

**ค้างไว้ตามที่ Dev สั่งพัก:** ยังไม่ได้ authorize ร้านที่สอง — ขั้นนี้ต้องล็อกอินบัญชี TikTok ของร้านนั้นแล้วกด "เชื่อมร้านเพิ่ม" ในหน้า `/sale/settings` (ห้ามใช้ลิงก์ "Copy authorization link" ของ Partner Center เพราะ callback เราบังคับ state cookie และรับเฉพาะร้าน `SANDBOX_` เมื่อไม่มี state) · Live Data / Analytics ยังไม่มีโค้ดฝั่งเรา
