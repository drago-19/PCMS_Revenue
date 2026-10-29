import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DailyBatchesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; date?: string }>;
}) {
  const params = await searchParams;
  const targetDate = (params.date ?? params.q ?? "").trim();
  if (targetDate) {
    redirect(`/bills?date=${encodeURIComponent(targetDate)}`);
  }
  redirect("/bills");
}
