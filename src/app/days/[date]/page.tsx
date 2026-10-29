import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DailyDetailRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{
    page?: string;
    category?: string;
    sort?: string;
  }>;
}) {
  const { date } = await params;
  const resolved = await searchParams;
  const search = new URLSearchParams();
  if (date) search.set("date", date);
  if (resolved.category && resolved.category !== "normal") {
    search.set("category", resolved.category);
  }
  if (resolved.sort && resolved.sort !== "latest") {
    search.set("sort", resolved.sort);
  }
  if (resolved.page && Number(resolved.page) > 1) {
    search.set("page", resolved.page);
  }
  const qs = search.toString();
  redirect(qs ? `/bills?${qs}` : "/bills");
}
