import React, { useState } from 'react';
import {
  Archive,
  BookOpen,
  Compass,
  Database,
  FileText,
  FolderLock,
  Landmark,
  Layers,
  ScrollText,
  Shield,
} from 'lucide-react';
import { ArchiveDTO, CategoryDTO } from '../shared/types';
import { resolveLocalizedText } from '../shared/i18n';
import { useApp } from '../context/AppContext';

export const CATEGORY_ICON_OPTIONS = [
  'Archive',
  'BookOpen',
  'ScrollText',
  'Landmark',
  'Shield',
  'FolderLock',
  'Compass',
  'Layers',
  'Database',
  'FileText',
] as const;

export function CategoryIcon({
  name,
  color = '#B89B63',
  className = 'h-5 w-5',
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  const props = { className, style: { color } };
  switch (name) {
    case 'BookOpen':
      return <BookOpen {...props} />;
    case 'ScrollText':
      return <ScrollText {...props} />;
    case 'Landmark':
      return <Landmark {...props} />;
    case 'Shield':
      return <Shield {...props} />;
    case 'FolderLock':
      return <FolderLock {...props} />;
    case 'Compass':
      return <Compass {...props} />;
    case 'Layers':
      return <Layers {...props} />;
    case 'Database':
      return <Database {...props} />;
    case 'FileText':
      return <FileText {...props} />;
    default:
      return <Archive {...props} />;
  }
}

export function ResilientImage({
  src,
  alt,
  className = '',
  fallbackTitle,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#151E1A] via-[#101715] to-[#090D0C] p-6 text-center ${className}`}
      >
        <Archive className="h-7 w-7 text-[#B89B63]/60 mb-2" />
        {fallbackTitle && (
          <span className="font-display text-sm tracking-wide text-[#A9AEA7]">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function CategoryCard({
  category,
  variant = 'editorial',
  onSelect,
}: {
  category: CategoryDTO;
  variant?: 'editorial' | 'compact';
  onSelect: (slug: string) => void;
}) {
  const { lang, t } = useApp();
  const title = resolveLocalizedText(category.nameTr, category.nameEn, lang);
  const desc = resolveLocalizedText(category.descriptionTr, category.descriptionEn, lang);

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={() => onSelect(category.slug)}
        className="group flex w-full items-start justify-between gap-4 rounded-lg border border-[#223029] bg-[#101715] p-5 text-left transition-transform duration-200 hover:-translate-y-0.5 hover:border-[#B89B63]/60"
      >
        <div className="flex items-start gap-4 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#25332C] bg-[#151E1A]">
            <CategoryIcon name={category.icon} color={category.accentColor || '#B89B63'} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-xl font-semibold text-[#E9E7DF] group-hover:text-[#B89B63] transition-colors truncate">
              {title}
            </h3>
            {desc && (
              <p className="mt-1 text-sm text-[#A9AEA7] line-clamp-2 leading-relaxed">{desc}</p>
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-[#8D968F] tabular-nums">
              <span>
                {category.archiveCount}{' '}
                {lang === 'en' && category.archiveCount === 1 ? 'Archive' : t.explorer.itemsCount}
              </span>
              <span aria-hidden="true">·</span>
              <span style={{ color: category.accentColor || '#557B67' }}>
                {category.accessible !== false ? t.explorer.accessible : t.explorer.restricted}
              </span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(category.slug)}
      className="group flex flex-col overflow-hidden rounded-lg border border-[#223029] bg-[#101715] text-left transition-transform duration-200 hover:-translate-y-0.5 hover:border-[#B89B63]/60"
    >
      <div className="relative h-40 w-full overflow-hidden border-b border-[#223029]">
        {category.coverImageUrl ? (
          <>
            <ResilientImage
              src={category.coverImageUrl}
              alt={title}
              fallbackTitle={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090D0C]/85 via-[#090D0C]/30 to-transparent" />
          </>
        ) : (
          <div
            className="flex h-full w-full items-center justify-between px-6"
            style={{
              background: `radial-gradient(circle at 80% 20%, ${category.accentColor || '#B89B63'}22, #101715 70%)`,
            }}
          >
            <CategoryIcon
              name={category.icon}
              color={category.accentColor || '#B89B63'}
              className="h-9 w-9"
            />
            <span className="font-mono text-xs text-[#8D968F] tabular-nums">
              /{category.slug}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <div className="flex items-center gap-2.5">
            <CategoryIcon
              name={category.icon}
              color={category.accentColor || '#B89B63'}
              className="h-4 w-4 shrink-0"
            />
            <h3 className="font-display text-2xl font-semibold text-[#E9E7DF] group-hover:text-[#B89B63] transition-colors">
              {title}
            </h3>
          </div>
          {desc && (
            <p className="mt-2.5 text-sm text-[#A9AEA7] line-clamp-2 leading-relaxed">{desc}</p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[#1D2823] pt-3.5 text-xs text-[#8D968F] tabular-nums">
          <span>
            {category.archiveCount}{' '}
            {lang === 'en' && category.archiveCount === 1 ? 'Archive' : t.explorer.itemsCount}
          </span>
          <span style={{ color: category.accentColor || '#557B67' }}>
            {category.accessible !== false ? t.explorer.accessible : t.explorer.restricted}
          </span>
        </div>
      </div>
    </button>
  );
}

export function ArchiveCard({
  archive,
  onSelect,
  onTagClick,
}: {
  archive: ArchiveDTO;
  onSelect: (slug: string) => void;
  onTagClick?: (tag: string) => void;
}) {
  const { lang, t } = useApp();
  const title = resolveLocalizedText(archive.titleTr, archive.titleEn, lang);
  const desc = resolveLocalizedText(archive.shortDescTr, archive.shortDescEn, lang);

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-[#223029] bg-[#101715] transition-transform duration-200 hover:-translate-y-0.5 hover:border-[#B89B63]/60">
      {archive.coverImageUrl && (
        <div className="h-44 w-full overflow-hidden border-b border-[#223029]">
          <ResilientImage
            src={archive.coverImageUrl}
            alt={title}
            fallbackTitle={title}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8D968F] tabular-nums">
            {archive.isFeatured && (
              <>
                <span className="font-medium text-[#B89B63]">{t.explorer.featuredBadge}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{archive.accessLevel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {archive.viewCount}{' '}
              {lang === 'en' && archive.viewCount === 1 ? 'View' : t.explorer.views}
            </span>
            {archive.files.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {archive.files.length}
                </span>
              </>
            )}
          </div>
          <h3 className="mt-2.5 font-display text-2xl font-semibold leading-snug text-[#E9E7DF]">
            <button
              type="button"
              onClick={() => onSelect(archive.slug)}
              className="text-left hover:text-[#B89B63] transition-colors"
            >
              {title}
            </button>
          </h3>
          {desc && (
            <p className="mt-2 text-sm leading-relaxed text-[#A9AEA7] line-clamp-3">{desc}</p>
          )}
          {archive.sourceInfo && (
            <p className="mt-2.5 truncate font-mono text-[11px] text-[#8D968F]">
              {archive.sourceInfo}
            </p>
          )}
        </div>

        {archive.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-2 gap-y-1 border-t border-[#1D2823] pt-3 text-xs text-[#8D968F]">
            {archive.tags.map((tag, i) => (
              <React.Fragment key={tag}>
                {i > 0 && <span aria-hidden="true">·</span>}
                {onTagClick ? (
                  <button
                    type="button"
                    onClick={() => onTagClick(tag)}
                    className="hover:text-[#B89B63]"
                  >
                    #{tag}
                  </button>
                ) : (
                  <span>#{tag}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
