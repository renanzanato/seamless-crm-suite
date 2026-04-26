import type { Role } from '@/types';

const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  user: 2,
  rep: 2,
  manager: 3,
  admin: 4,
};

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function hasPermission(role: Role | null | undefined, required: Role): boolean {
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[required];
}
