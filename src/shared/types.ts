export type UserRank = 'UYE' | 'DESTEKCI' | 'ISLETME' | 'ADMIN';

export type AdminProfile = 'ADMIN';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED_TEMP' | 'BANNED_PERM';

export type AccessKeyType = 'MEMBER' | 'ADMIN';

export type Language = 'tr' | 'en';

export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'ARCHIVED';

export type RuleEffect = 'ALLOW' | 'DENY' | 'INHERIT';

export type FileDownloadPermission = 'INHERIT' | 'ALLOW' | 'DENY';

export type PermissionScope = 'GLOBAL' | 'CATEGORY' | 'ARCHIVE';

export type ReportCategory =
  | 'COPYRIGHT'
  | 'MALWARE_OR_UNSAFE'
  | 'PRIVACY_VIOLATION'
  | 'ILLEGAL_CONTENT'
  | 'INACCURATE_OR_SPAM'
  | 'OTHER';

export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export const USER_RANKS: UserRank[] = ['UYE', 'DESTEKCI', 'ISLETME', 'ADMIN'];
export const ASSIGNABLE_MEMBER_RANKS: Exclude<UserRank, 'ADMIN'>[] = ['UYE', 'DESTEKCI', 'ISLETME'];

export const ALL_PERMISSIONS = [
  'view_archives',
  'view_categories',
  'download_files',
  'upload_files',
  'edit_archives',
  'delete_archives',
  'add_favorites',
  'search_archives',
  'access_special_collections',
  'view_hidden_content',
  'view_user_profiles',
  'post_comments',
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

export const ADMIN_CAPABILITIES: Record<AdminProfile, string[]> = {
  ADMIN: [
    'admin.overview',
    'admin.users',
    'admin.categories',
    'admin.subcategories',
    'admin.archives',
    'admin.files',
    'admin.permissions',
    'admin.reports',
    'admin.security',
    'admin.audit',
    'admin.backups',
    'admin.settings',
  ],
};

export interface RoleDTO {
  id: string;
  displayNameTr: string;
  displayNameEn: string;
  hierarchyOrder: number;
  isAdminRole: boolean;
  isSystemRank: boolean;
  color: string;
  descriptionTr: string;
  descriptionEn: string;
  memberCount?: number;
}

export interface PermissionResolutionInput {
  rank: UserRank;
  adminProfile?: AdminProfile | null;
  keyType?: AccessKeyType;
  accountStatus: AccountStatus;
  permission: PermissionKey;
  categoryId?: string | null;
  subcategoryId?: string | null;
  archiveId?: string | null;
  rolePermissions: Partial<Record<PermissionKey, boolean>>;
  categoryRules?: RuleEffect[];
  subcategoryRules?: RuleEffect[];
  archiveRules?: RuleEffect[];
  categoryRule?: RuleEffect | null;
  archiveRule?: RuleEffect | null;
  userGlobalOverride?: RuleEffect | null;
  userCategoryOverride?: RuleEffect | null;
  userArchiveOverride?: RuleEffect | null;
}

export type ResolutionTier =
  | 'ACCOUNT_STATUS'
  | 'ADMIN_PROFILE'
  | 'USER_OVERRIDE_ARCHIVE'
  | 'USER_OVERRIDE_CATEGORY'
  | 'USER_OVERRIDE_GLOBAL'
  | 'ARCHIVE_RULE'
  | 'SUBCATEGORY_RULE'
  | 'CATEGORY_RULE'
  | 'ROLE_PERMISSION'
  | 'DEFAULT_DENY';

export interface PermissionResolutionResult {
  allowed: boolean;
  decidedBy: ResolutionTier;
  reason: string;
  trace: Array<{
    tier: ResolutionTier;
    effect: 'ALLOW' | 'DENY' | 'PASS';
  }>;
}

export interface CategoryDTO {
  id: string;
  slug: string;
  nameTr: string;
  nameEn: string;
  descriptionTr: string;
  descriptionEn: string;
  icon: string;
  coverImageUrl: string;
  accentColor: string;
  parentId: string | null;
  visibility: 'PUBLIC' | 'HIDDEN' | 'ARCHIVED';
  sortOrder: number;
  archiveCount: number;
  accessible?: boolean;
  roleRules?: Record<string, RuleEffect>;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveFileDTO {
  id: string;
  archiveId: string;
  title: string;
  description: string;
  downloadPermission: FileDownloadPermission;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: 'CLEAN' | 'QUARANTINED' | 'UNSCANNED';
  downloadCount: number;
  canDownload?: boolean;
  createdAt: string;
}

export interface ArchiveDTO {
  id: string;
  slug: string;
  categoryId: string;
  subcategoryId: string | null;
  titleTr: string;
  titleEn: string;
  shortDescTr: string;
  shortDescEn: string;
  longDescTr: string;
  longDescEn: string;
  sourceInfo: string;
  coverImageUrl: string;
  accessLevel: string;
  searchVisible: boolean;
  isFeatured: boolean;
  status: PublicationStatus;
  publishedAt: string | null;
  viewCount: number;
  tags: string[];
  files: ArchiveFileDTO[];
  isFavorited?: boolean;
  canDownload?: boolean;
  roleRules?: Record<string, RuleEffect>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomRoleBadgeDTO {
  id: string;
  displayNameTr: string;
  displayNameEn: string;
  color: string;
}

export interface UserSummaryDTO {
  id: string;
  username: string;
  avatarUrl: string;
  rank: UserRank;
  adminProfile: AdminProfile | null;
  keyType: AccessKeyType;
  status: AccountStatus;
  preferredLang: Language;
  mfaEnabled: boolean;
  activeSessions: number;
  customRoles: CustomRoleBadgeDTO[];
  lastActiveAt: string | null;
  createdAt: string;
  banReason?: string | null;
  banExpiresAt?: string | null;
}

export interface ContentReportDTO {
  id: string;
  archiveId: string;
  archiveSlug: string;
  archiveTitleTr: string;
  archiveTitleEn: string;
  archiveStatus: PublicationStatus;
  reporterId: string;
  reporterUsername: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  actionTaken: string | null;
  resolutionNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AuditLogDTO {
  id: number;
  actorId: string | null;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  beforeJson: string | null;
  afterJson: string | null;
  prevHash: string;
  entryHash: string;
  createdAt: string;
}

export interface BackupSnapshotDTO {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}
