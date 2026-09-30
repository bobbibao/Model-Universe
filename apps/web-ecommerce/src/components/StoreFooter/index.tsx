import { hasTrackingTags, openConsentSettings } from '@/shared/client/utils/consent';

const socialIcons = [
  {
    label: 'X',
    path: 'M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.24-8.28L2.96 2h6.4l4.42 5.84L18.9 2Zm-1.1 18.13h1.73L8.47 3.77H6.62l11.18 16.36Z',
  },
  {
    label: 'Facebook',
    path: 'M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z',
  },
  {
    label: 'Instagram',
    path: 'M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm0 8.2a3.2 3.2 0 1 1 3.2-3.2 3.2 3.2 0 0 1-3.2 3.2ZM17.2 5.6a1.2 1.2 0 1 0 1.2 1.2 1.2 1.2 0 0 0-1.2-1.2ZM21.94 7.1a5.8 5.8 0 0 0-1.58-4.1 5.8 5.8 0 0 0-4.1-1.58C14.64 1.33 9.36 1.33 7.74 1.42a5.8 5.8 0 0 0-4.1 1.57A5.8 5.8 0 0 0 2.06 7.1c-.09 1.62-.09 6.9 0 8.52a5.8 5.8 0 0 0 1.58 4.1 5.8 5.8 0 0 0 4.1 1.58c1.62.09 6.9.09 8.52 0a5.8 5.8 0 0 0 4.1-1.58 5.8 5.8 0 0 0 1.58-4.1c.09-1.62.09-6.9 0-8.52Z',
  },
  {
    label: 'YouTube',
    path: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z',
  },
];

const StoreFooter = () => {
  return (
    <footer className="mt-10 border-t border-stroke bg-gray-2 text-black dark:border-store-card dark:bg-store-panel dark:text-store-text">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-2">
        <div className="flex flex-col items-center gap-1 text-center md:items-start md:text-left">
          <h3 className="mb-2 text-lg font-semibold">Văn phòng Việt Nam</h3>
          <p>Địa chỉ: 123 Vạn Kiếp, Phường 3, Quận Bình Thạnh, TP. Hồ Chí Minh</p>
          <p>Điện thoại: +84 373 498 729</p>
          <p>Email: lehoangbao5678@gmail.com</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 md:items-end">
          <div className="flex gap-4">
            {socialIcons.map((icon) => (
              <span key={icon.label} aria-label={icon.label} className="text-store-muted">
                <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={icon.path} />
                </svg>
              </span>
            ))}
          </div>
          <p className="text-center text-sm text-store-muted md:text-right">
            Ý tưởng từ Kuzma Clothing &amp; Shoes,
            <br />
            thực hiện bởi BobbiBao © 2024
          </p>
          {hasTrackingTags && (
            <button onClick={openConsentSettings} className="text-sm text-store-muted underline">
              Cài đặt cookie
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};

export default StoreFooter;
