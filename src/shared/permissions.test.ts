import test from 'node:test';
import assert from 'node:assert/strict';
import { combineRoleRules, resolvePermission, hasAdminCapability, canManageTargetUser } from './permissions';

test('banned or frozen user is denied regardless of overrides or role', () => {
  const res = resolvePermission({
    rank: 'ISLETME',
    accountStatus: 'SUSPENDED',
    permission: 'view_archives',
    rolePermissions: { view_archives: true },
    userGlobalOverride: 'ALLOW',
    archiveRule: 'ALLOW',
  });
  assert.equal(res.allowed, false);
  assert.equal(res.decidedBy, 'ACCOUNT_STATUS');
});

test('explicit user archive DENY overrides category ALLOW and role ALLOW', () => {
  const res = resolvePermission({
    rank: 'DESTEKCI',
    accountStatus: 'ACTIVE',
    permission: 'view_archives',
    categoryId: 'cat-1',
    archiveId: 'arc-1',
    rolePermissions: { view_archives: true },
    categoryRule: 'ALLOW',
    archiveRule: 'ALLOW',
    userArchiveOverride: 'DENY',
  });
  assert.equal(res.allowed, false);
  assert.equal(res.decidedBy, 'USER_OVERRIDE_ARCHIVE');
});

test('explicit user archive ALLOW grants access to UYE even when archive/category/role deny', () => {
  const res = resolvePermission({
    rank: 'UYE',
    accountStatus: 'ACTIVE',
    permission: 'view_archives',
    categoryId: 'cat-1',
    archiveId: 'arc-1',
    rolePermissions: { view_archives: false },
    categoryRule: 'DENY',
    archiveRule: 'DENY',
    userArchiveOverride: 'ALLOW',
  });
  assert.equal(res.allowed, true);
  assert.equal(res.decidedBy, 'USER_OVERRIDE_ARCHIVE');
});

test('multi-role conflict resolution enforces DENY over ALLOW within the same tier', () => {
  assert.equal(combineRoleRules(['ALLOW', 'DENY']), 'DENY');
  assert.equal(combineRoleRules(['INHERIT', 'ALLOW']), 'ALLOW');
  assert.equal(combineRoleRules(['INHERIT', null]), 'INHERIT');

  const res = resolvePermission({
    rank: 'UYE',
    accountStatus: 'ACTIVE',
    permission: 'view_archives',
    categoryId: 'cat-1',
    rolePermissions: { view_archives: true },
    categoryRules: ['ALLOW', 'DENY'],
  });
  assert.equal(res.allowed, false);
  assert.equal(res.decidedBy, 'CATEGORY_RULE');
});

test('subcategory rule takes precedence over parent category rule', () => {
  const res = resolvePermission({
    rank: 'UYE',
    accountStatus: 'ACTIVE',
    permission: 'view_archives',
    categoryId: 'cat-1',
    subcategoryId: 'sub-1',
    archiveId: 'arc-1',
    rolePermissions: { view_archives: false },
    categoryRules: ['ALLOW'],
    subcategoryRules: ['DENY'],
    archiveRules: ['INHERIT'],
  });
  assert.equal(res.allowed, false);
  assert.equal(res.decidedBy, 'SUBCATEGORY_RULE');
});

test('custom role permissions combine additively when no explicit category/archive DENY exists', () => {
  const res = resolvePermission({
    rank: 'UYE',
    accountStatus: 'ACTIVE',
    permission: 'upload_files',
    rolePermissions: { upload_files: true },
  });
  assert.equal(res.allowed, true);
  assert.equal(res.decidedBy, 'ROLE_PERMISSION');
});

test('defaults to DENY when no rule explicitly allows (rank name alone never grants blind permission)', () => {
  const res = resolvePermission({
    rank: 'ISLETME',
    accountStatus: 'ACTIVE',
    permission: 'view_hidden_content',
    rolePermissions: {},
  });
  assert.equal(res.allowed, false);
  assert.equal(res.decidedBy, 'DEFAULT_DENY');
});

test('admin capabilities enforce unified ADMIN boundary and self-management protection', () => {
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.overview'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.users'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.categories'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.subcategories'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.archives'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.files'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.permissions'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.reports'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.security'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.audit'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.backups'), true);
  assert.equal(hasAdminCapability('ADMIN', 'ADMIN', 'admin.settings'), true);

  assert.equal(hasAdminCapability('UYE', null, 'admin.archives'), false);
  assert.equal(hasAdminCapability('ADMIN', null, 'admin.users'), false);

  assert.equal(canManageTargetUser('ADMIN', 'ADMIN', 'a1', 'UYE', null, 'u1'), true);
  assert.equal(canManageTargetUser('ADMIN', 'ADMIN', 'a1', 'ADMIN', 'ADMIN', 'a1'), false);
  assert.equal(canManageTargetUser('ADMIN', 'ADMIN', 'a2', 'ADMIN', 'ADMIN', 'a1'), false);
});

