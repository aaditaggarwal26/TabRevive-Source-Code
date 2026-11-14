const basePath = process.env.BASE_PATH || '';

export default {
    output: 'export',
    trailingSlash: true,
    basePath,
    images: { unoptimized: true },
    env: { NEXT_PUBLIC_BASE_PATH: basePath }
};
