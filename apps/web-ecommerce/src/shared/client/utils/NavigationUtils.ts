// Only same-site relative paths are accepted as post-login redirect targets (prevents open redirects).
export const getSafeRedirect = (redirect: string | null | undefined, fallback = '/'): string => {
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/\\')) {
    return fallback;
  }
  return redirect;
};
