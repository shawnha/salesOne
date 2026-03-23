import { auth } from "@/lib/auth";
import { canAccessCompany } from "@/lib/auth-utils";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
    };
  }
  return { error: null, session };
}

export async function requireCompanyAccess(targetCompanyId: string | null) {
  const { error, session } = await requireAuth();
  if (error) return { error, session: null };
  const user = session!.user as any;
  if (!canAccessCompany(user.role, user.companyId, targetCompanyId)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session: null,
    };
  }
  return { error: null, session };
}
