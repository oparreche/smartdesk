import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '@/src/lib/prisma';
import { env } from '@/src/lib/env';
import { checkRateLimit } from '@/src/lib/rate-limit';
import { logger } from '@/src/lib/logger';
import type { OrgRole } from '@prisma/client';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SessionUserMembership = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: OrgRole;
};

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      memberships: SessionUserMembership[];
      activeOrganizationId: string | null;
      activeRole: OrgRole | null;
    } & DefaultSession['user'];
  }
}

type AppJwt = {
  userId?: string;
  memberships?: SessionUserMembership[];
  activeOrganizationId?: string | null;
  activeRole?: OrgRole | null;
};

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(rawCredentials, request) {
        const parsed = CredentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Rate-limit: 5 falhas/15min/email + 20 tentativas/15min/IP
        // (registramos hit ANTES de validar para contar tentativas falhas e válidas)
        const ip = getClientIpFromAuthRequest(request) ?? 'unknown';
        const emailHit = await checkRateLimit({
          bucket: `login:email:${email.toLowerCase()}`,
          windowSeconds: 15 * 60,
          max: 10,
        });
        const ipHit = await checkRateLimit({
          bucket: `login:ip:${ip}`,
          windowSeconds: 15 * 60,
          max: 30,
        });

        if (!emailHit.allowed || !ipHit.allowed) {
          logger.warn(
            { email, ip, emailCount: emailHit.count, ipCount: ipHit.count },
            'login rate-limited',
          );
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            avatarUrl: true,
            deletedAt: true,
          },
        });

        if (!user || user.deletedAt || !user.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          logger.info({ email, ip }, 'login failed (bad password)');
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const t = token as AppJwt & typeof token;

      if (user) {
        t.userId = user.id as string;
        const memberships = await loadMemberships(user.id as string);
        t.memberships = memberships;
        t.activeOrganizationId = memberships[0]?.organizationId ?? null;
        t.activeRole = memberships[0]?.role ?? null;
      }

      if (trigger === 'update' && session && typeof session === 'object') {
        const nextActive = (session as { activeOrganizationId?: string }).activeOrganizationId;
        if (nextActive && t.memberships) {
          const m = t.memberships.find((mm) => mm.organizationId === nextActive);
          if (m) {
            t.activeOrganizationId = m.organizationId;
            t.activeRole = m.role;
          }
        }
      }

      return t;
    },
    async session({ session, token }) {
      const t = token as AppJwt;
      if (t.userId) {
        session.user.id = t.userId;
      }
      session.user.memberships = t.memberships ?? [];
      session.user.activeOrganizationId = t.activeOrganizationId ?? null;
      session.user.activeRole = t.activeRole ?? null;
      return session;
    },
  },
});

function getClientIpFromAuthRequest(request: unknown): string | null {
  if (!request || typeof request !== 'object') return null;
  const req = request as { headers?: unknown };
  if (!req.headers) return null;
  const headers = req.headers as Headers | Record<string, unknown>;
  // Auth.js v5 passa Request padrão com Headers
  if (typeof (headers as Headers).get === 'function') {
    const xff = (headers as Headers).get('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim();
    return (headers as Headers).get('x-real-ip') ?? null;
  }
  const h = headers as Record<string, string | undefined>;
  if (h['x-forwarded-for']) return h['x-forwarded-for']!.split(',')[0]!.trim();
  return h['x-real-ip'] ?? null;
}

async function loadMemberships(userId: string): Promise<SessionUserMembership[]> {
  const rows = await prisma.organizationUser.findMany({
    where: { userId, status: 'active' },
    select: {
      role: true,
      organization: {
        select: { id: true, slug: true, name: true, status: true, deletedAt: true },
      },
    },
  });
  return rows
    .filter((r) => r.organization.status === 'active' && !r.organization.deletedAt)
    .map((r) => ({
      organizationId: r.organization.id,
      organizationSlug: r.organization.slug,
      organizationName: r.organization.name,
      role: r.role,
    }));
}
