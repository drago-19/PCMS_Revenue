# PCMS Revenue — คู่มือการรันระบบ

ระบบสรุปบิลรายวันจากไฟล์ export ของ **TikTok Shop** เป็นบิลรายคำสั่งซื้อ + ใบกำกับภาษี (อย่างย่อ) พร้อมตรวจสอบความถูกต้องอัตโนมัติ

---

## 1. สิ่งที่ต้องมีก่อน

- **Docker Desktop** (เปิดรันอยู่) — สำหรับรันฐานข้อมูล PostgreSQL และตัวแอป
- **Node.js 24+** และ **pnpm** (ถ้าจะรันแบบ dev/CLI บนเครื่อง)

---

## 2. เปิดระบบด้วย Docker (แนะนำ)

```bash
docker compose up -d --build
```

จะได้คอนเทนเนอร์ 3 ตัว:

| ชื่อ | หน้าที่ | พอร์ต (บนเครื่อง) |
|---|---|---|
| `pcms-supabase-db` (Supabase เดิม) | ฐานข้อมูล PostgreSQL (แชร์) database แยก `pcms_revenue` | 5432 |
| `pcms-revenue-app` | เว็บแอป | **3001** → เปิด http://localhost:3001 |
| `pcms-revenue-pgadmin` | เปิดดูฐานข้อมูล (GUI) | 5050 |

**เปิดใช้งาน pgAdmin (GUI ดูข้อมูล):**
```bash
docker compose --profile admin up -d
```
เข้า http://localhost:5050 → email `admin@pcms-revenue.com` / password `admin123`
→ **Add New Server**: Host `host.docker.internal`, Port `5432`, DB `pcms_revenue`, User `postgres`, Password `postgrespassword`

**เปิด Cloudflare Tunnel (ให้คนอื่นเข้าผ่านโดเมน):**
```bash
docker compose --profile tunnel up -d
```
(ต้องมี token ใน `.env` ก่อน ดูหัวข้อ 7)

---

## 3. รันแบบ dev บนเครื่อง (ถ้าไม่ใช้ Docker)

```bash
cp .env.example .env        # แก้ DATABASE_URL ให้ชี้ไปที่ 5432/pcms_revenue
pnpm install
# ฐานข้อมูล = Supabase (โปรเจกต์อื่น) ที่รันอยู่แล้วบน 5432 — ไม่ต้องรัน db แยก
PORT=4321 pnpm dev          # เปิด http://localhost:4321
```

> พอร์ต 3000 บนเครื่องถูกโปรเจกต์อื่นใช้อยู่ จึงรัน dev ที่ 4321 แทน

---

## 4. นำเข้าข้อมูล (ทำบิลทุกวัน)

**วิธี A — ผ่านหน้าเว็บ (ง่ายสุด):** เปิด http://localhost:3001/import → ลากไฟล์ .xlsx วาง → ระบบสร้างบิล + ใบกำกับภาษีให้ทันที

**วิธี B — ผ่าน CLI:**
```bash
pnpm run import:file -- C:\path\to\income_xxx.xlsx     # นำเข้าไฟล์เดียว
pnpm run import:dir -- C:\path\to\folder                 # นำเข้าทุกไฟล์ในโฟลเดอร์
```
(ไฟล์ซ้ำจะถูกข้ามด้วย hash อัตโนมัติ วางไฟล์ลง `imports/inbox` แล้วรัน `pnpm run import:dir` ก็ได้)

---

## 5. หน้าในระบบ

| หน้า | ใช้ทำอะไร |
|---|---|
| `/` | ภาพรวม + รอบรายวันล่าสุด |
| `/import` | อัปโหลดไฟล์รายได้ + ประวัติการนำเข้า |
| `/import/[id]` | **รายงานการนำเข้า** — ตรวจยอด/คอลัมน์ใหม่/คำเตือน |
| `/bills` | ค้นหาบิลทั้งหมด |
| `/bills/[orderId]` | บิลสรุปยอดชำระรายคำสั่งซื้อ (พิมพ์ได้) |
| `/days/[date]` | รอบชำระรายวัน |
| `/invoices/[orderId]` | ใบกำกับภาษีใบเดียว |
| `/days/[date]/invoices` | **พิมพ์ใบกำกับภาษีทั้งรอบเป็นชุด** |

---

## 6. ตรวจว่าข้อมูลถูกต้อง + รองรับคอลัมน์เปลี่ยน

- ทุกครั้งที่นำเข้า ระบบจะ **เทียบยอดกับชีตสรุป** ของไฟล์ และแสดงที่หน้า `/import/[id]`
- ถ้า **TikTok เปลี่ยนรูปแบบ export** (เพิ่ม/ลดคอลัมน์, เปลี่ยนชื่อหัว): ระบบจับคู่หัวคอลัมน์แบบยืดหยุ่น แล้วแจ้งเตือน "พบรูปแบบใหม่" + ลิสต์คอลัมน์ที่ไม่รู้จัก พร้อมแสดงส่วนต่างในบิล (ยอดไม่หาย)
- รันเทสต์อัตโนมัติ: `pnpm test` (ครอบการเปลี่ยนรูปแบบหลายกรณี)

---

## 7. Cloudflare Tunnel (เปิดให้คนอื่นใช้ผ่านโดเมน)

1. สร้าง tunnel ใน Cloudflare Zero Trust → Networks → Tunnels → ได้ **token**
2. ใส่ token ใน `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=xxxx_โทเคน_xxxx
   ```
3. ที่หน้า tunnel → **Public Hostname → Add**: Hostname `Revenue.goldpulse-ai.com`, **Service URL = `http://app:3000`** (ภายใน docker network ไม่ใช่พอร์ต 3000 บนเครื่อง)
4. รัน: `docker compose --profile tunnel up -d`

---

## 8. ค่าตั้งค่าใบกำกับภาษี (แก้ใน `.env`)

| ตัวแปร | ค่าเริ่มต้น |
|---|---|
| `SELLER_NAME` | บริษัท ชีเฮง จำกัด (สำนักงานใหญ่) |
| `SELLER_ADDRESS` | 3675 ถนนพระรามที่ 4 ... 10110 |
| `SELLER_TAX_ID` | 0655568002694 |
| `SELLER_VAT_RATE` | 7 |
| `INVOICE_PREFIX` | TT (เลขที่ใบ = `TT{YYMM}/{ลำดับ}`) |

---

## 9. แก้ปัญหาเบื้องต้น

| อาการ | วิธีแก้ |
|---|---|
| หน้าเว็บ 500 / `ECONNREFUSED 127.0.0.1:5432` | Supabase (โปรเจกต์อื่น) ยังไม่รัน → เปิด Supabase stack ก่อน |
| http://localhost:3000 ไม่ใช่ระบบนี้ | โปรเจกต์อื่นใช้พอร์ต 3000 — ระบบนี้อยู่ที่ 3001 (docker) หรือ 4321 (preview) |
| pgAdmin 5050 เข้าไม่ได้ | `docker compose --profile admin up -d` |
| นำเข้าแล้วบิลไม่โผล่ | ดูหน้า `/import` ว่าไฟล์ถูก "ซ้ำ" หรือไม่ (hash เดิม = ข้าม) |
| อยากลบการนำเข้าที่ผิด | หน้า `/import/[id]` → ปุ่ม "ลบการนำเข้านี้" |

---

### คำสั่งสรุปที่ใช้บ่อย

```bash
docker compose up -d --build       # เริ่มทุกอย่าง
docker compose ps                  # ดูสถานะคอนเทนเนอร์
docker compose logs -f app         # ดู log แอป
pnpm test                          # รันเทสต์
```
