// Build authentication links from trusted configuration, never an incoming Host / forwarded header.
export const shopOrigin = () => {
  const url = new URL(process.env.SHOP_PUBLIC_URL || 'http://localhost:6050');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    throw new Error('SHOP_PUBLIC_URL must use HTTPS (HTTP is allowed only on localhost)');
  return url.origin;
};
