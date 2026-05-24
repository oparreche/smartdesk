import type { OrgRole } from '@prisma/client';

export type Permission =
  // Tickets
  | 'tickets:read'
  | 'tickets:create'
  | 'tickets:update'
  | 'tickets:delete'
  | 'tickets:assign'
  | 'tickets:reply'
  // Settings & config
  | 'settings:read'
  | 'settings:write'
  | 'users:manage'
  | 'queues:manage'
  | 'tags:manage'
  // Integrations & layouts
  | 'integrations:read'
  | 'integrations:write'
  | 'integrations:run'
  | 'layouts:read'
  | 'layouts:write'
  | 'forms:read'
  | 'forms:write'
  | 'rules:read'
  | 'rules:write'
  | 'gmail:manage'
  | 'whatsapp:manage'
  // Reports & audit
  | 'reports:read'
  | 'audit:read'
  // Organization
  | 'organization:manage';

const PERMISSIONS_BY_ROLE: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:delete', 'tickets:assign', 'tickets:reply',
    'settings:read', 'settings:write', 'users:manage', 'queues:manage', 'tags:manage',
    'integrations:read', 'integrations:write', 'integrations:run',
    'layouts:read', 'layouts:write',
    'forms:read', 'forms:write',
    'rules:read', 'rules:write',
    'gmail:manage',
    'whatsapp:manage',
    'reports:read', 'audit:read',
    'organization:manage',
  ]),
  admin: new Set<Permission>([
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:delete', 'tickets:assign', 'tickets:reply',
    'settings:read', 'settings:write', 'users:manage', 'queues:manage', 'tags:manage',
    'integrations:read', 'integrations:write', 'integrations:run',
    'layouts:read', 'layouts:write',
    'forms:read', 'forms:write',
    'rules:read', 'rules:write',
    'gmail:manage',
    'whatsapp:manage',
    'reports:read', 'audit:read',
  ]),
  supervisor: new Set<Permission>([
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:assign', 'tickets:reply',
    'settings:read',
    'integrations:read', 'integrations:run',
    'layouts:read', 'forms:read', 'rules:read',
    'reports:read',
  ]),
  agent: new Set<Permission>([
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:reply',
    'integrations:read', 'integrations:run',
    'layouts:read', 'forms:read',
  ]),
  viewer: new Set<Permission>([
    'tickets:read',
    'integrations:read',
    'layouts:read', 'forms:read', 'rules:read',
    'reports:read',
  ]),
};

export function can(role: OrgRole, permission: Permission): boolean {
  return PERMISSIONS_BY_ROLE[role]?.has(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

export function requirePermission(role: OrgRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError(permission);
  }
}
