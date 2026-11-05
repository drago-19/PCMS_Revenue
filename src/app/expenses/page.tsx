import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExpensesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const yearQuery =
    params.year && params.year !== "all"
      ? `&period=${encodeURIComponent(params.year)}`
      : "";
  redirect(`/accounting?tab=expenses${yearQuery}`);
}
