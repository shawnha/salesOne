import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            appRoles: {
              where: { app: "salesone" },
              include: { company: true },
            },
          },
        });
        if (!user || !user.passwordHash) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;
        const primaryRole = user.appRoles[0];
        if (!primaryRole || !primaryRole.company) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: primaryRole.role,
          companyId: primaryRole.companyId!,
          companyName: primaryRole.company.name,
        };
      },
    }),
  ],
});
