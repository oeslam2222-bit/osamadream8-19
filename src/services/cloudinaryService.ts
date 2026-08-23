import { CloudinaryConfig, Product } from '../types';

export const DEFAULT_CLOUDINARY_CONFIG: CloudinaryConfig = {
  cloudName: '',
  folderPrefix: '',
  defaultTransformation: '',
  matchingPattern: 'auto',
  fileExtension: 'auto',
  baseUrlPattern: ''
};

/**
 * Extract clean Google Drive File ID from any Google Drive URL format or raw ID
 */
export function extractGoogleDriveFileId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();

  // If it's already a raw ID (e.g. 1A2b3C4d5E6F7G8H9I0J...)
  if (/^[a-zA-Z0-9_-]{25,55}$/.test(trimmed)) {
    return trimmed;
  }

  // /file/d/FILE_ID/
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch) return fileDMatch[1];

  // id=FILE_ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];

  // /d/FILE_ID (lh3.googleusercontent.com/d/FILE_ID)
  const lh3Match = trimmed.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (lh3Match) return lh3Match[1];

  // open?id=FILE_ID
  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  return null;
}

/**
 * Build fast, dynamically compressed Google Drive image URLs with size parameters (e.g. s=260, w=260)
 */
export function buildGoogleDriveCompressedUrls(urlOrId: string, size = 260): string[] {
  const fileId = extractGoogleDriveFileId(urlOrId);
  if (!fileId) return [];

  // Produce ordered candidate URLs from fastest compressed CDN to standard fallback
  return [
    // 1. Google High-Speed Content CDN with dynamic size constraint (WebP/JPEG auto-compressed)
    `https://lh3.googleusercontent.com/d/${fileId}=s${size}`,
    `https://lh3.googleusercontent.com/d/${fileId}=w${size}-h${size}-c`,
    // 2. Google Drive Thumbnail API with dynamic width/height parameter
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}-h${size}`,
    `https://drive.google.com/thumbnail?id=${fileId}&s=${size}`,
    // 3. Fallback direct export view
    `https://drive.google.com/uc?export=view&id=${fileId}`
  ];
}

/**
 * Dynamically optimize any image URL (Google Drive, direct links) for target size and bandwidth savings
 */
export function optimizeImageUrl(rawUrl: string, targetSize = 260, isDataSaver = false): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();

  // Check if it's a Google Drive link
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    const size = isDataSaver ? Math.min(targetSize, 180) : targetSize;
    return `https://lh3.googleusercontent.com/d/${driveId}=s${size}`;
  }

  return trimmed;
}

/**
 * Generate a clean, bright, branded SVG placeholder image when no image is available
 */
export function generateProductPlaceholderSvg(code: string, category: string, name: string): string {
  const shortCode = code || 'ITEM';
  const cat = category || 'دريم طنطاوي';
  const cleanName = (name || '').length > 25 ? `${name.substring(0, 25)}...` : name || 'صنف للتوزيع';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc" />
        <stop offset="50%" stop-color="#f1f5f9" />
        <stop offset="100%" stop-color="#e2e8f0" />
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.08" />
      </filter>
    </defs>
    <rect width="400" height="400" fill="url(#bg)" rx="24"/>
    <rect x="20" y="20" width="360" height="360" rx="18" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6,6"/>
    
    <!-- Stylized Package / Studio Icon -->
    <circle cx="200" cy="150" r="54" fill="#ffffff" filter="url(#shadow)"/>
    <circle cx="200" cy="150" r="50" fill="#fffbeb" stroke="#fef3c7" stroke-width="2"/>
    <path d="M175 142 L200 126 L225 142 L200 158 Z" fill="url(#gold)"/>
    <path d="M175 145 L175 168 L200 182 L200 160 Z" fill="#b45309" opacity="0.85"/>
    <path d="M225 145 L225 168 L200 182 L200 160 Z" fill="#f59e0b" opacity="0.95"/>
    
    <!-- Code Badge -->
    <rect x="130" y="222" width="140" height="32" rx="10" fill="#0f172a"/>
    <text x="200" y="244" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#fbbf24" text-anchor="middle" letter-spacing="1">${shortCode}</text>
    
    <!-- Category & Name -->
    <text x="200" y="280" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#1e293b" text-anchor="middle">${cat}</text>
    <text x="200" y="306" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="#64748b" text-anchor="middle">${cleanName}</text>
    
    <!-- Subtle Watermark -->
    <text x="200" y="352" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="bold" fill="#94a3b8" text-anchor="middle">شركة دريم للتجارة والتوزيع</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Generate targeted candidate URLs for a product
 * Prioritizes direct image links from Google Sheets and Google Drive
 * Returns empty array if no link is provided, immediately triggering the SVG placeholder
 */
export function getCandidateImageUrls(
  product: Partial<Product>,
  _config?: CloudinaryConfig
): string[] {
  const candidates: string[] = [];

  // 1. Direct explicit image URL from Google Sheets or product data
  if (product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim()) {
    const rawUrl = product.imageUrl.trim();
    
    // If it's a Google Drive link, expand to high-speed compressed CDN URLs
    const driveUrls = buildGoogleDriveCompressedUrls(rawUrl, 320);
    if (driveUrls.length > 0) {
      candidates.push(...driveUrls);
    } else if (rawUrl.startsWith('http')) {
      candidates.push(rawUrl);
    }
  }

  return Array.from(new Set(candidates));
}

/**
 * Generate primary image URL for a given product or return branded SVG
 */
export function getProductImageUrl(product: Partial<Product>, config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG): string {
  const candidates = getCandidateImageUrls(product, config);
  if (candidates.length > 0) {
    return candidates[0];
  }
  return generateProductPlaceholderSvg(product.code || '', product.category || '', product.name || '');
}

/**
 * Batch match images against list of products
 */
export function batchMatchCloudinaryImages(
  products: Product[],
  config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG
): { updatedCount: number; sampleMatches: { code: string; name: string; url: string }[] } {
  let count = 0;
  const samples: { code: string; name: string; url: string }[] = [];

  products.forEach((p) => {
    const generatedUrl = getProductImageUrl(p, config);
    if (generatedUrl && !generatedUrl.startsWith('data:image/svg+xml')) {
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

// Browser Cache Helpers for high speed offline image browsing
export async function getCachedImagesStats(): Promise<{ count: number; estimatedSizeMB: number }> {
  return { count: 0, estimatedSizeMB: 0 };
}
