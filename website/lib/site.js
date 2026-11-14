export const SITE_URL = process.env.SITE_URL || 'https://tabrevive.com';
export const STORE_URL = 'https://chromewebstore.google.com/detail/EXTENSION_ID';
export const asset = (file) => `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/${file}`;
