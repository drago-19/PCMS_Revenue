# docs/PROGRESS.md — กระดานสถานะงาน PCMS_Revenue

<!-- AI_READ_HEAD_ONLY: อ่านเฉพาะหัว ACTIVE — ห้ามอ่านทั้งไฟล์ -->

> 📌 ไฟล์นี้คือ **กระดานสถานะ** ไม่ใช่บันทึกประวัติ — งานที่ปิดแล้วให้ย้ายเข้า `docs/archive/` (≤80 บรรทัด ตรวจด้วย `~/.AGENTS.d/tools/progress.ps1 check -Root .`)
> บันทึกเดิมทั้งไฟล์ (2,041 บรรทัด) อยู่ที่ `docs/archive/PROGRESS_ARCHIVE_2026_11.md` · ประวัติจริง = `git log --oneline -20`
> ⚖️ 1 repo = 1 writer (Claim-First Gate): ก่อนแก้ไฟล์ `~/.AGENTS.d/tools/claim.ps1 acquire -Root . -Owner <เครื่องมือ>-<ชื่อแชท> -Files <path,...>` → ตาราง ACTIVE ด้านล่างถูกเขียนให้เอง · เสร็จ = `release`

## 🔄 ACTIVE (ใครถืออะไร)

<!-- ACTIVE:BEGIN -->
| owner | งาน | ไฟล์ที่จอง | เริ่ม | แตะล่าสุด |
|---|---|---|---|---|
| aetox-tiktok-isv-app | ชุดเอกสารสร้างแอป TikTok หมวด ISV แทนแอปเดิม | docs/TIKTOK-ISV-APP-PLAN.md | 11-20 06:21Z | 11-20 06:21Z |
<!-- ACTIVE:END -->

## 🎯 เป้าหมายรอบนี้

- **สต็อกกลาง (2026-11-18)** — เจ้าของงานคือส่วนนี้: หน้า `/sale/central-stock` (แท็บ "สต็อกกลาง") สำหรับเติมของและผูก SKU ของทุกร้านเข้าที่เดียว · ตาราง `central_stock` / `central_stock_movements` / `central_stock_links` · หักยอดจากออเดอร์ TikTok/Shopee/Facebook อัตโนมัติ + เขียนยอดคงเหลือกลับไปที่ประกาศของทุกร้านที่ผูกไว้ (`src/lib/stock/push.ts`, รอบนาทีละครั้ง + ทันทีหลังเติมของ) + แผงในป๊อปอัป SKU ของ `/sale/stocks`
- **หลักฐาน**: `tests/central-stock.test.ts` 5/5 ผ่าน · ทดสอบเขียนจริงบนร้านทดสอบ TikTok แล้ว (3 → 7 → 3)

## ✅ เสร็จในรอบนี้

- [x] 2026-11-18 — **ซ่อนร้านแล้วหยุดดึง/หยุดแสดงข้อมูลของร้านนั้น**: `getActiveShopId` ข้ามร้านที่ซ่อนหรือหลุดการเชื่อมต่อ · จุดดึงข้อมูลทุกตัวกรอง/ปฏิเสธร้านที่ซ่อน (TikTok ออเดอร์+statement+คำขอคืน, สต็อก TikTok, Shopee ออเดอร์+สต็อก, แดชบอร์ด, `scheduler.ts`) · หน้าฝ่ายขาย (`/sale/stocks`, `/sale/orders`, `/sale/ops`) ไม่เปิดข้อมูลร้านที่ซ่อนแม้ระบุ `?shop=` · `tests/platform-hidden-shops.test.ts` 3/3 · ตรวจบน `localhost:3001` แล้ว — **ต้องรีสตาร์ทเซิร์ฟเวอร์** รอบซิงก์อัตโนมัติจึงใช้โค้ดใหม่
- [x] 2026-11-14 — **Shopee Open Platform ครบวง (sandbox `228022110`)**: OAuth + token refresh · อ่าน/เขียนสต็อก (`unlist_item`, `delete_item`) · เพิ่มสินค้า+รูป (`media_space/upload_image` → `product/update_item`) · แก้ราคา/ชื่อ/ตัวเลือก (`init_tier_variation`) · Push webhook ตรวจ HMAC + โทเคนใน URL ผ่าน prod (ยิงทดสอบได้ 200) · `tests/platform-shopee.test.ts` ผ่าน · `tsc` 0 error · `pnpm build` ผ่าน · ข้อจำกัด: sandbox คืนชื่อหมวดหมู่เป็นรหัสตัวเลข
- [x] 2026-11-14 — **กัน `Invalid timestamp` จาก TikTok + หน้า `/platform/stocks` ไม่ล่มเมื่อซิงก์พลาด**: ชดเชยเวลาจาก HTTP `Date` เมื่อต่าง ≥ 5 วินาที + เซ็นใหม่ในลูป retry · `syncStock` คืน `{skus, changed, error}` แทน throw + การ์ดเตือนบนหน้า
- [x] 2026-11-19 — **จัดระเบียบ PROGRESS**: ย้ายบันทึกเดิม 2,041 บรรทัดไป `docs/archive/PROGRESS_ARCHIVE_2026_11.md` (สำรองทั้งไฟล์ ตรวจ SHA256 ตรงกัน) แล้วเริ่มกระดานสถานะนี้

## ⛔ Blocker

- ไม่มี blocker ฝั่งโค้ด — งานที่ค้างคือการรอของจริง/รอผู้ใช้ (ดูหัวข้อถัดไป)

## ▶️ ต่อไป 3 อย่าง

- [ ] **ของคืนเข้าคลังกลาง** — ยังไม่ทำในรอบสต็อกกลาง
- [ ] เขียนยอดกลับร้านจริง Kissi Studio สักครั้ง (ยังไม่มี SKU ที่ผูก+เติมของ) · Shopee ยังไม่มีร้านจริงให้ทดสอบ
- [ ] (ผู้ใช้) นำเข้าไฟล์รายได้ Shopee จริง + ไฟล์ย้อนหลังรายเดือนใน production และรัน full rebuild `daily_summaries` — ข้อ 8-9 ของเป้าหมายเดิมยังไม่ติ๊ก

## 🕘 รอบก่อน ๆ (≤3 รอบ)

- 2026-11-14 — Shopee Sandbox: ซิงก์ออเดอร์/ยอดโอน/สต็อก + Webhook + สร้างสินค้าได้จริง
- 2026-11-11 — ใบกำกับ Shopee: เพิ่มบรรทัด "ค่าจัดส่งสินค้าที่ออกโดย Shopee" ให้ยอดตรงเอกสาร
- 2026-10-29 — เลขใบกำกับ/ใบเสร็จเปลี่ยนรหัสปี-เดือน (`YYMM`) และเริ่มนับลำดับใหม่รายเดือน
