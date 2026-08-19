import { CloudinaryConfig, Product } from '../types';

export const DEFAULT_CLOUDINARY_CONFIG: CloudinaryConfig = {
  cloudName: 'dream-dist',
  folderPrefix: 'products',
  defaultTransformation: 'f_auto,q_auto,w_500,c_fill',
  matchingPattern: 'code',
  fileExtension: 'jpg',
  baseUrlPattern: 'https://res.cloudinary.com/{cloudName}/image/upload/{transformations}/{folder}/{filename}.{extension}'
};

/**
 * Generate a clean, branded SVG placeholder image when no image is available
 */
export function generateProductPlaceholderSvg(code: string, category: string, name: string): string {
  const shortCode = code || 'ITEM';
  const cat = category || 'DREAM';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="50%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#334155" />
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#bg)" rx="24"/>
    <circle cx="200" cy="160" r="60" fill="#f59e0b" opacity="0.15" />
    <path d="M170 160 L200 130 L230 160 L200 190 Z" fill="#fbbf24" opacity="0.8"/>
    <text x="200" y="245" font-family="system-ui, sans-serif" font-size="20" font-weight="900" fill="#f8fafc" text-anchor="middle">${shortCode}</text>
    <text x="200" y="275" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" text-anchor="middle">${cat}</text>
    <text x="200" y="340" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Cloudinary Image Matching</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Sanitize strings into valid Cloudinary public IDs (clean slug)
 */
export function sanitizeToCloudinarySlug(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[^\w\u0621-\u064A0-9-_]/g, '_')
    .replace(/_+/g, '_');
}

/**
 * Generate a smart Cloudinary image URL for a given product
 */
export function getProductImageUrl(product: Partial<Product>, config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG): string {
  // 1. If product already has an explicit direct valid URL (and not old unsplash dummy), use it
  if (product.imageUrl && product.imageUrl.startsWith('http') && !product.imageUrl.includes('unsplash.com')) {
    return product.imageUrl;
  }

  // 2. If product has a specific cloudinary public ID
  if (product.cloudinaryPublicId) {
    const folderPart = config.folderPrefix ? `${config.folderPrefix}/` : '';
    const ext = config.fileExtension === 'auto' ? '' : `.${config.fileExtension}`;
    return `https://res.cloudinary.com/${config.cloudName}/image/upload/${config.defaultTransformation}/${folderPart}${product.cloudinaryPublicId}${ext}`;
  }

  // 3. Auto-match by code or name using Cloudinary pattern
  let identifier = '';
  if (config.matchingPattern === 'code' && product.code) {
    identifier = product.code.trim();
  } else if (config.matchingPattern === 'name' && product.name) {
    identifier = sanitizeToCloudinarySlug(product.name);
  } else if (config.matchingPattern === 'slug') {
    identifier = `${product.code || ''}_${sanitizeToCloudinarySlug(product.name || '')}`;
  } else {
    identifier = product.code || sanitizeToCloudinarySlug(product.name || 'item');
  }

  if (identifier && config.cloudName) {
    const ext = config.fileExtension === 'auto' ? '' : `.${config.fileExtension}`;
    const folderPart = config.folderPrefix ? `${config.folderPrefix}/` : '';
    return `https://res.cloudinary.com/${config.cloudName}/image/upload/${config.defaultTransformation}/${folderPart}${identifier}${ext}`;
  }

  // Fallback clean SVG placeholder
  return generateProductPlaceholderSvg(product.code || '', product.category || '', product.name || '');
}

/**
 * Batch match Cloudinary images against list of products
 */
export function batchMatchCloudinaryImages(
  products: Product[],
  config: CloudinaryConfig
): { updatedCount: number; sampleMatches: { code: string; name: string; url: string }[] } {
  let count = 0;
  const samples: { code: string; name: string; url: string }[] = [];

  products.forEach((p) => {
    const generatedUrl = getProductImageUrl(p, config);
    if (generatedUrl) {
      count++;
      if (samples.length < 5) {
        samples.push({
          code: p.code,
          name: p.name,
          url: generatedUrl
        });
      }
    }
  });

  return { updatedCount: count, sampleMatches: samples };
}
