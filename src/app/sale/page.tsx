import { redirect } from "next/navigation";

// ทางเข้าหมวดฝ่ายขาย — เปิด /sale แล้วลงที่คิวออเดอร์ทันที (งานที่พนักงานขายเปิดบ่อยที่สุด)
export default function SaleLandingPage() {
  redirect("/sale/orders");
}
