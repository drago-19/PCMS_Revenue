# ระบบตัวอย่างสำหรับรีวิว Shopee (demo environment)

ทำไว้เพื่อให้ Shopee เข้าไปตรวจผลิตภัณฑ์ได้ โดย**ไม่เปิดข้อมูลลูกค้าจริง** — ใช้เมื่อสมัคร Shopee Open Platform แบบ Third-party Partner Platform (ISV) ซึ่งบังคับให้ส่ง URL และบัญชีทดลอง

## องค์ประกอบ

| ส่วน | ค่า |
|---|---|
| โดเมน | `https://demo.goldpulse-ai.com` |
| ฐานข้อมูล | `pcms_revenue_demo` บน Postgres เดียวกับ prod (`100.95.170.43:5432`) |
| คอนเทนเนอร์ | `pcms-revenue-demo-app` (พอร์ต 3003) จาก `docker-compose.demo.yml` |
| Tunnel | cloudflared Windows service บนเซิร์ฟเวอร์ → `localhost:3003` |
| บัญชีทดลอง | `shopee.review` (role `staff`) — รหัสอยู่ใน `Desktop\shopee-review-login.txt` ของเครื่อง Dev |

## ข้อมูลในระบบ demo

ข้อมูลทั้งหมดเป็นของสมมติ (ชื่อคน ที่อยู่ เลขคำสั่งซื้อขึ้นต้นด้วย `DEMO-`) — 6 ออเดอร์ (TikTok 3 · Shopee 3), 4 สินค้า, ใบกำกับ 3 ใบ
สคริปต์ `scripts/seed-demo.ts` จะ**ปฏิเสธการทำงาน**ถ้าชื่อฐานข้อมูลไม่มีคำว่า `demo`

## วิธีเตรียมใหม่ทั้งหมด

```powershell
pnpm exec tsx scripts/demo-bootstrap.ts      # สร้าง DB + ตาราง (เฉพาะชื่อที่ลงท้าย _demo)
pnpm exec tsx scripts/seed-demo.ts --user shopee.review --out C:\path\login.txt
```

บนเซิร์ฟเวอร์:

```powershell
cd C:\Users\DEV\Documents\GitHub\PCMS_Revenue
git pull
docker compose -f docker-compose.demo.yml up -d --build app-demo
```

## ค่าที่ต้องมีใน `.env` ของเซิร์ฟเวอร์

- `DEMO_AUTH_SESSION_SECRET` — ยาว 32 ตัวขึ้นไป (ถ้าไม่ตั้ง session จะหลุดทุกครั้งที่รีสตาร์ท)
- `DEMO_AUTH_USERNAME` — ต้องตรงกับบัญชีในฐานข้อมูล demo (`shopee.review`)
- `DEMO_AUTH_PASSWORD` — ใช้ตอนสร้างบัญชีครั้งแรก
- `DEMO_DATABASE_URL` — ถ้าไม่ตั้ง compose จะต่อ `pcms_revenue_demo` ให้เอง
- `DEMO_CLOUDFLARE_TUNNEL_TOKEN` — เฉพาะกรณีรัน tunnel ผ่าน docker (ของจริงใช้ cloudflared service บนเครื่อง)

## ข้อควรระวัง

- `ensureAdminUser` (`src/lib/auth.ts:123`) ไม่รับชื่อผู้ใช้ใด ๆ ก็ได้ — มันใช้ `AUTH_USERNAME` เป็นหลัก ชื่อบัญชีทดลองจึงต้องตั้งให้ตรงกัน ไม่งั้นล็อกอินได้แค่บัญชีตั้งต้น
- `role` ของ `app_users` ไม่ได้จำกัดสิทธิ์ในโค้ด (staff กับ admin เห็นเท่ากัน) — ความปลอดภัยของระบบ demo มาจาก "ฐานข้อมูลแยก" ไม่ใช่จากสิทธิ์ผู้ใช้
- เมื่อรีวิวเสร็จ ควรปิดคอนเทนเนอร์ demo และ rotate token ของ tunnel
