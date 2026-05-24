/**
 * seed-demo — popula o banco com dados iniciais para validar end-to-end.
 *
 * Rodar com `pnpm seed:demo`. Idempotente — pode rodar várias vezes.
 */
import { PrismaClient, OrgRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Iniciando seed...');

  // ── Organização demo ────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      slug: 'demo',
      name: 'Demo SmartDesk',
      plan: 'trial',
    },
  });
  console.log(`  org: ${org.slug}`);

  // ── Users ───────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 10);
  const agentHash = await bcrypt.hash('agent123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {},
    create: {
      email: 'admin@demo.local',
      name: 'Admin Demo',
      passwordHash: adminHash,
      emailVerifiedAt: new Date(),
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: 'agent@demo.local' },
    update: {},
    create: {
      email: 'agent@demo.local',
      name: 'Agent Demo',
      passwordHash: agentHash,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`  users: ${admin.email}, ${agent.email}`);

  // ── Memberships ─────────────────────────────────────────────
  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    update: { role: OrgRole.admin },
    create: {
      organizationId: org.id,
      userId: admin.id,
      role: OrgRole.admin,
      joinedAt: new Date(),
    },
  });
  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: agent.id } },
    update: { role: OrgRole.agent },
    create: {
      organizationId: org.id,
      userId: agent.id,
      role: OrgRole.agent,
      joinedAt: new Date(),
    },
  });

  // ── Queue default ───────────────────────────────────────────
  const queue = await prisma.queue.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'suporte' } },
    update: { isDefault: true },
    create: {
      organizationId: org.id,
      slug: 'suporte',
      name: 'Suporte',
      description: 'Fila padrão de atendimento',
      isDefault: true,
    },
  });
  console.log(`  queue: ${queue.slug}`);

  // ── SLA policy ──────────────────────────────────────────────
  const existingPolicy = await prisma.slaPolicy.findFirst({
    where: { organizationId: org.id, name: 'Default 8h/24h' },
  });
  const slaPolicy =
    existingPolicy ??
    (await prisma.slaPolicy.create({
      data: {
        organizationId: org.id,
        name: 'Default 8h/24h',
        description: 'Primeira resposta em 8h, resolução em 24h',
        appliesTo: { priorities: ['low', 'normal', 'high', 'urgent', 'critical'] },
        firstResponseMins: 8 * 60,
        resolutionMins: 24 * 60,
        timezone: 'America/Sao_Paulo',
      },
    }));
  console.log(`  sla: ${slaPolicy.name}`);

  // ── Layout default (Painel Inteligente) ─────────────────────
  const existingLayout = await prisma.ticketLayout.findFirst({
    where: { organizationId: org.id, isDefault: true },
  });
  if (!existingLayout) {
    await prisma.ticketLayout.create({
      data: {
        organizationId: org.id,
        name: 'Layout padrão',
        scope: 'organization',
        isDefault: true,
        createdById: admin.id,
        config: {
          blocks: [
            {
              id: 'blk_requester',
              type: 'info_card',
              title: 'Solicitante',
              fields: [
                { label: 'Nome', value: '{{ticket.requester.name}}', format: 'text' },
                { label: 'Email', value: '{{ticket.requester.email}}', format: 'email' },
                { label: 'Documento', value: '{{ticket.requester.document}}', format: 'document' },
              ],
            },
          ],
        },
      },
    });
    console.log('  layout: criado layout padrão');
  } else {
    console.log('  layout: já existia');
  }

  console.log('\n✅  Seed concluído.');
  console.log('\nCredenciais para login (http://localhost:3000/login):');
  console.log('  Admin: admin@demo.local / admin123');
  console.log('  Agent: agent@demo.local / agent123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
