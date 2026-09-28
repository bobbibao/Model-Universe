import Link from 'next/link';

export const BRAND_NAME = 'Clothing Shop';

interface BrandLogoProps {
  href?: string;
  className?: string;
  showName?: boolean;
}

const BrandLogo = ({ href = '/', className = '', showName = true }: BrandLogoProps) => {
  return (
    <Link href={href} className={`flex items-center gap-2 text-2xl font-bold text-brand ${className}`}>
      <svg className="h-7 w-7 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 7h-2.1A5 5 0 0 0 7.1 7H5a1 1 0 0 0-1 .92l-1 12A1 1 0 0 0 4 21h16a1 1 0 0 0 1-1.08l-1-12A1 1 0 0 0 19 7Zm-7-3a3 3 0 0 1 2.83 2H9.17A3 3 0 0 1 12 4Zm-3 7a1 1 0 1 1 1-1 1 1 0 0 1-1 1Zm6 0a1 1 0 1 1 1-1 1 1 0 0 1-1 1Z" />
      </svg>
      {showName && <span>{BRAND_NAME}</span>}
    </Link>
  );
};

export default BrandLogo;
