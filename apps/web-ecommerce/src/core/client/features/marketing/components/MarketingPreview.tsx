'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MarketingDraftInput } from '@/shared/types/admin-marketing';

// Mock-ups that look like the real placements, so an admin reviews the post as customers will see it. They render
// only what the draft contains; engagement numbers are fixed placeholders, labelled as such.
const BRAND = 'Model Universe';
const HANDLE = 'modeluniverse';
const DOMAIN = 'modeluniverse.vn';

export interface PreviewMedia {
  url: string;
  kind: 'image' | 'video';
}

interface PreviewProps {
  input: MarketingDraftInput;
  media?: PreviewMedia;
  gallery?: PreviewMedia[];
  productName?: string;
}

const Avatar = ({ size = 40 }: { size?: number }) => (
  <span className="mk-avatar" style={{ width: size, height: size }} aria-hidden="true">
    MU
  </span>
);

const Globe = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm4.9 6h-2.1a11 11 0 0 0-.9-3.8A5.5 5.5 0 0 1 12.9 7zM8 2.6c.6.8 1.2 2.4 1.3 4.4H6.7C6.8 5 7.4 3.4 8 2.6zM6.1 3.2A11 11 0 0 0 5.2 7H3.1a5.5 5.5 0 0 1 3-3.8zM3.1 8.5h2.1c.1 1.4.4 2.7.9 3.8a5.5 5.5 0 0 1-3-3.8zM8 13.4c-.6-.8-1.2-2.4-1.3-4.9h2.6c-.1 2.5-.7 4.1-1.3 4.9zm1.9-1.1c.5-1.1.8-2.4.9-3.8h2.1a5.5 5.5 0 0 1-3 3.8z"
    />
  </svg>
);

function MediaFrame({ media, ratio, label }: { media?: PreviewMedia; ratio: string; label: string }) {
  if (!media)
    return (
      <div className="mk-media-empty" style={{ aspectRatio: ratio }}>
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M15 9h.01" />
        </svg>
        <span>{label}</span>
      </div>
    );
  return media.kind === 'video' ? (
    <video className="mk-media" style={{ aspectRatio: ratio }} src={media.url} muted loop autoPlay playsInline />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- previews show remote and uploaded media as-is
    <img className="mk-media" style={{ aspectRatio: ratio }} src={media.url} alt="" />
  );
}

function ExpandableText({ text, lines = 4 }: { text: string; lines?: number }) {
  const t = useTranslations('marketingStudio.preview');
  const [open, setOpen] = useState(false);
  const long = text.split('\n').length > lines || text.length > lines * 70;
  return (
    <div className="mk-fb-text">
      <p className={open || !long ? '' : 'is-clamped'} style={{ WebkitLineClamp: lines }}>
        {text}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)}>
          {open ? t('less') : t('more')}
        </button>
      )}
    </div>
  );
}

function FacebookPreview({ input, media, gallery, productName, sponsored }: PreviewProps & { sponsored: boolean }) {
  const t = useTranslations('marketingStudio.preview');
  const text = (sponsored ? input.primaryText : input.message).trim();
  const headline = (sponsored ? input.headline : productName || input.name).trim();
  return (
    <article className="mk-fb">
      <header className="mk-fb-head">
        <Avatar />
        <div>
          <strong>{BRAND}</strong>
          <span>
            {sponsored ? t('sponsored') : t('justNow')} · <Globe />
          </span>
        </div>
        <span className="mk-fb-more" aria-hidden="true">
          ···
        </span>
      </header>
      {text ? <ExpandableText text={text} /> : <p className="mk-placeholder mk-fb-pad">{t('emptyText')}</p>}
      {!sponsored && gallery && gallery.length > 1 ? (
        <div
          className={`mk-preview-gallery has-${Math.min(4, gallery.length)}`}
          role="group"
          aria-label={t('photoCount', { count: gallery.length })}
        >
          {gallery.slice(0, 4).map((item, index) => (
            <div key={`${item.url}-${index}`}>
              <MediaFrame media={item} ratio="1 / 1" label={t('noMedia')} />
              {index === 3 && gallery.length > 4 && <span>+{gallery.length - 4}</span>}
            </div>
          ))}
        </div>
      ) : (
        <MediaFrame media={media} ratio={sponsored ? '1 / 1' : '1.91 / 1'} label={t('noMedia')} />
      )}
      <div className="mk-fb-link">
        <div className="min-w-0">
          <span>{DOMAIN.toUpperCase()}</span>
          <strong>{headline || t('emptyHeadline')}</strong>
        </div>
        {sponsored && (
          <span className="mk-fb-cta">{input.objective === 'conversions' ? t('ctaShop') : t('ctaLearn')}</span>
        )}
      </div>
      <div className="mk-fb-stats" aria-label={t('engagementNote')}>
        <span>
          <span className="mk-reaction is-like">👍</span>
          <span className="mk-reaction is-love">❤️</span> 128
        </span>
        <span>{t('commentsShares', { comments: 24, shares: 6 })}</span>
      </div>
      <div className="mk-fb-actions" aria-hidden="true">
        <span>{t('like')}</span>
        <span>{t('comment')}</span>
        <span>{t('share')}</span>
      </div>
    </article>
  );
}

function GooglePreview({ input }: PreviewProps) {
  const t = useTranslations('marketingStudio.preview');
  const headlines = input.headlines.map((line) => line.trim()).filter(Boolean);
  const descriptions = input.descriptions.map((line) => line.trim()).filter(Boolean);
  const path = input.linkPath.replace(/^\/+/, '').split(/[/?#]/)[0];
  return (
    <article className="mk-google">
      <div className="mk-google-search">
        <span className="mk-google-logo" aria-hidden="true">
          G
        </span>
        <span className="min-w-0 truncate">{input.keywords.find((word) => word.trim()) || t('searchPlaceholder')}</span>
      </div>
      <div className="mk-google-result">
        <span className="mk-google-sponsored">{t('sponsoredGoogle')}</span>
        <div className="mk-google-site">
          <Avatar size={28} />
          <div className="min-w-0">
            <strong>{BRAND}</strong>
            <span>
              https://{DOMAIN}
              {path ? ` › ${path}` : ''}
            </span>
          </div>
        </div>
        <h4>{headlines.slice(0, 3).join(' | ') || t('emptyHeadline')}</h4>
        <p>{descriptions.slice(0, 2).join(' ') || t('emptyText')}</p>
      </div>
      {headlines.length + descriptions.length > 0 && (
        <p className="mk-preview-note">
          {t('googleNote', { headlines: headlines.length, descriptions: descriptions.length })}
        </p>
      )}
    </article>
  );
}

function TikTokPreview({ input, media }: PreviewProps) {
  const t = useTranslations('marketingStudio.preview');
  return (
    <article className="mk-tiktok">
      <MediaFrame media={media} ratio="9 / 16" label={t('noVideo')} />
      <div className="mk-tiktok-rail" aria-hidden="true">
        <Avatar size={40} />
        <span>
          ♥<small>12,4K</small>
        </span>
        <span>
          💬<small>318</small>
        </span>
        <span>
          ↗<small>96</small>
        </span>
      </div>
      <div className="mk-tiktok-caption">
        <strong>@{HANDLE}</strong>
        <span className="mk-tiktok-sponsored">{t('sponsored')}</span>
        <p>{input.adText.trim() || t('emptyText')}</p>
        <span className="mk-tiktok-cta">
          {input.objective === 'conversions' ? t('ctaShop') : t('ctaLearn')}
          <span aria-hidden="true">›</span>
        </span>
      </div>
    </article>
  );
}

export default function MarketingPreview(props: PreviewProps) {
  const { input } = props;
  if (input.channel === 'google') return <GooglePreview {...props} />;
  if (input.channel === 'tiktok') return <TikTokPreview {...props} />;
  return <FacebookPreview {...props} sponsored={input.channel === 'meta'} />;
}
