import {
  ADMIN_CAPABILITIES,
  AdminProfile,
  PermissionResolutionInput,
  PermissionResolutionResult,
  ResolutionTier,
  RuleEffect,
  UserRank,
} from './types';

/**
 * Combines rule effects across a user's fundamental rank and any assigned custom roles.
 * Security-first: explicit DENY in any assigned role overrides ALLOW in another role.
 */
export function combineRoleRules(rules: Array<RuleEffect | null | undefined>): RuleEffect {
  let hasAllow = false;
  for (const r of rules) {
    if (r === 'DENY') return 'DENY';
    if (r === 'ALLOW') hasAllow = true;
  }
  return hasAllow ? 'ALLOW' : 'INHERIT';
}

/**
 * Resolves a single permission check strictly following Sentarika's precedence:
 * 1. Account Status Gate (Suspended/Frozen/Banned immediately denied)
 * 2. Unified Admin Security Profile (requires ADMIN rank + ADMIN profile + ADMIN keyType when supplied)
 * 3. User-Specific Explicit Overrides (Archive -> Category -> Global; DENY always holds)
 * 4. Archive-Level Rules (Rank + Custom Roles; DENY overrides ALLOW)
 * 5. Subcategory-Level Rules (Rank + Custom Roles; DENY overrides ALLOW)
 * 6. Category-Level Rules (Rank + Custom Roles; DENY overrides ALLOW)
 * 7. Role-Level Permission Matrix (Rank + Custom Roles union)
 * 8. Default Deny
 */
export function resolvePermission(input: PermissionResolutionInput): PermissionResolutionResult {
  const trace: PermissionResolutionResult['trace'] = [];

  if (input.accountStatus !== 'ACTIVE') {
    trace.push({ tier: 'ACCOUNT_STATUS', effect: 'DENY' });
    return {
      allowed: false,
      decidedBy: 'ACCOUNT_STATUS',
      reason: `Account status is ${input.accountStatus}`,
      trace,
    };
  }
  trace.push({ tier: 'ACCOUNT_STATUS', effect: 'PASS' });

  // Tier 1: Unified ADMIN privilege (verified ADMIN rank + ADMIN profile + ADMIN key type)
  if (
    input.rank === 'ADMIN' &&
    input.adminProfile === 'ADMIN' &&
    (input.keyType === undefined || input.keyType === 'ADMIN')
  ) {
    trace.push({ tier: 'ADMIN_PROFILE', effect: 'ALLOW' });
    return {
      allowed: true,
      decidedBy: 'ADMIN_PROFILE',
      reason: 'Granted via unified ADMIN privilege',
      trace,
    };
  }
  trace.push({ tier: 'ADMIN_PROFILE', effect: 'PASS' });

  // Tier 2: User-specific explicit overrides (most specific scope first: Archive -> Category -> Global)
  const checkOverride = (
    override: RuleEffect | null | undefined,
    tier: ResolutionTier,
    label: string
  ): PermissionResolutionResult | null => {
    if (override === 'DENY') {
      trace.push({ tier, effect: 'DENY' });
      return {
        allowed: false,
        decidedBy: tier,
        reason: `Explicit user DENY override (${label})`,
        trace,
      };
    }
    if (override === 'ALLOW') {
      trace.push({ tier, effect: 'ALLOW' });
      return {
        allowed: true,
        decidedBy: tier,
        reason: `Explicit user ALLOW override (${label})`,
        trace,
      };
    }
    trace.push({ tier, effect: 'PASS' });
    return null;
  };

  if (input.archiveId) {
    const res = checkOverride(input.userArchiveOverride, 'USER_OVERRIDE_ARCHIVE', 'archive');
    if (res) return res;
  }

  if (input.categoryId) {
    const res = checkOverride(input.userCategoryOverride, 'USER_OVERRIDE_CATEGORY', 'category');
    if (res) return res;
  }

  const globalOverrideRes = checkOverride(input.userGlobalOverride, 'USER_OVERRIDE_GLOBAL', 'global');
  if (globalOverrideRes) return globalOverrideRes;

  // Tier 3: Archive-based rules (across Rank + Custom Roles)
  if (input.archiveId) {
    const effectiveArchiveRule = combineRoleRules([
      ...(input.archiveRules || []),
      input.archiveRule,
    ]);
    if (effectiveArchiveRule !== 'INHERIT') {
      const effect = effectiveArchiveRule === 'ALLOW' ? 'ALLOW' : 'DENY';
      trace.push({ tier: 'ARCHIVE_RULE', effect });
      return {
        allowed: effect === 'ALLOW',
        decidedBy: 'ARCHIVE_RULE',
        reason: `Archive rule across rank/roles is ${effect}`,
        trace,
      };
    }
    trace.push({ tier: 'ARCHIVE_RULE', effect: 'PASS' });
  }

  // Tier 4: Subcategory-based rules (if archive belongs to a subcategory)
  if (input.subcategoryId) {
    const effectiveSubRule = combineRoleRules(input.subcategoryRules || []);
    if (effectiveSubRule !== 'INHERIT') {
      const effect = effectiveSubRule === 'ALLOW' ? 'ALLOW' : 'DENY';
      trace.push({ tier: 'SUBCATEGORY_RULE', effect });
      return {
        allowed: effect === 'ALLOW',
        decidedBy: 'SUBCATEGORY_RULE',
        reason: `Subcategory rule across rank/roles is ${effect}`,
        trace,
      };
    }
    trace.push({ tier: 'SUBCATEGORY_RULE', effect: 'PASS' });
  }

  // Tier 5: Category-based rules (across Rank + Custom Roles)
  if (input.categoryId) {
    const effectiveCategoryRule = combineRoleRules([
      ...(input.categoryRules || []),
      input.categoryRule,
    ]);
    if (effectiveCategoryRule !== 'INHERIT') {
      const effect = effectiveCategoryRule === 'ALLOW' ? 'ALLOW' : 'DENY';
      trace.push({ tier: 'CATEGORY_RULE', effect });
      return {
        allowed: effect === 'ALLOW',
        decidedBy: 'CATEGORY_RULE',
        reason: `Category rule across rank/roles is ${effect}`,
        trace,
      };
    }
    trace.push({ tier: 'CATEGORY_RULE', effect: 'PASS' });
  }

  // Tier 6: Role-based permission matrix (union across Rank + Custom Roles)
  const roleAllowed = input.rolePermissions[input.permission];
  if (roleAllowed === true) {
    trace.push({ tier: 'ROLE_PERMISSION', effect: 'ALLOW' });
    return {
      allowed: true,
      decidedBy: 'ROLE_PERMISSION',
      reason: `Rank/role permissions permit ${input.permission}`,
      trace,
    };
  }
  trace.push({ tier: 'ROLE_PERMISSION', effect: roleAllowed === false ? 'DENY' : 'PASS' });

  // Tier 7: Default Deny
  trace.push({ tier: 'DEFAULT_DENY', effect: 'DENY' });
  return {
    allowed: false,
    decidedBy: 'DEFAULT_DENY',
    reason: 'Denied by default zero-trust policy',
    trace,
  };
}

export function hasAdminCapability(
  rank: UserRank,
  adminProfile: AdminProfile | null | undefined,
  capability: string
): boolean {
  if (rank !== 'ADMIN' || adminProfile !== 'ADMIN') return false;
  return ADMIN_CAPABILITIES.ADMIN.includes(capability);
}

/**
 * Ensures the unified ADMIN actor cannot self-demote/self-ban or alter another ADMIN record.
 */
export function canManageTargetUser(
  actorRank: UserRank,
  actorProfile: AdminProfile | null | undefined,
  actorId: string,
  targetRank: UserRank,
  _targetProfile: AdminProfile | null | undefined,
  targetId: string
): boolean {
  if (actorRank !== 'ADMIN' || actorProfile !== 'ADMIN') return false;
  if (actorId === targetId) return false;
  if (targetRank === 'ADMIN') return false;
  return true;
}
