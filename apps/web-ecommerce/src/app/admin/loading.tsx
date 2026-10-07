export default function AdminLoading() {
  return (
    <div role="status" className="flex min-h-40 items-center justify-center gap-3 text-body dark:text-bodydark">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      Đang tải trang…
    </div>
  );
}
