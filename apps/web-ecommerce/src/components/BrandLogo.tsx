import Link from '@/i18n/navigation';

export const BRAND_NAME = 'Model Universe';

interface BrandLogoProps {
  href?: string;
  className?: string;
  showName?: boolean;
}

const BrandLogo = ({ href = '/', className = '', showName = true }: BrandLogoProps) => {
  return (
    <Link href={href} className={`flex items-center gap-2 text-2xl font-bold text-brand ${className}`}>
      <svg className="h-8 w-8 shrink-0" fill="none" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 2 29 9v14l-13 7L3 23V9Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="m8 11 8 5 8-5M8 11v10l8 5 8-5V11M16 16v10M8 11l8-5 8 5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {showName && <span>{BRAND_NAME}</span>}
    </Link>
  );
};

export default BrandLogo;
