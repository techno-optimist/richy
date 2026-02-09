import { redirect } from "next/navigation";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function Home() {
  let onboardingComplete = false;

  try {
    const result = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "onboarding_complete"))
      .limit(1);

    if (result.length > 0) {
      onboardingComplete = JSON.parse(result[0].value) === true;
    }
  } catch {
    // DB may not exist yet on first run
  }

  if (!onboardingComplete) {
    redirect("/onboarding");
  }

  redirect("/chat");
}
