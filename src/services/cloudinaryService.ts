import { CloudinaryConfig, Product } from '../types';

export const DEFAULT_CLOUDINARY_CONFIG: CloudinaryConfig = {
  cloudName: 'dzdkhpr2y',
  folderPrefix: '',
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
    <text x="200" y="340" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Cloudinary Image</text>
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
 * Parse a raw Cloudinary URL to automatically extract Cloud Name, Folder, and File Extension
 */
export function parseCloudinaryUrl(url: string): {
  cloudName: string;
  folderPrefix: string;
  fileExtension: 'jpg' | 'png' | 'webp' | 'auto';
  sampleCodeOrFilename: string;
} | null {
  try {
    const trimmed = url.trim();
    if (!trimmed.includes('res.cloudinary.com/')) return null;

    // Pattern: https://res.cloudinary.com/<cloudName>/image/upload/<optional_transformations>/<folder>/<filename>.<ext>
    const match = trimmed.match(/res\.cloudinary\.com\/([^\/]+)\/image\/upload\/(?:[^\/]+\/)?(?:v\d+\/)?(.+)/);
    if (!match) return null;

    const cloudName = match[1];
    const restPath = decodeURIComponent(match[2]);

    const lastSlashIdx = restPath.lastIndexOf('/');
    let folderPrefix = '';
    let filenameWithExt = restPath;

    if (lastSlashIdx !== -1) {
      folderPrefix = restPath.substring(0, lastSlashIdx);
      filenameWithExt = restPath.substring(lastSlashIdx + 1);
    }

    const dotIdx = filenameWithExt.lastIndexOf('.');
    let fileExtension: 'jpg' | 'png' | 'webp' | 'auto' = 'jpg';
    let sampleCode = filenameWithExt;

    if (dotIdx !== -1) {
      const ext = filenameWithExt.substring(dotIdx + 1).toLowerCase();
      sampleCode = filenameWithExt.substring(0, dotIdx);
      if (['jpg', 'png', 'webp'].includes(ext)) {
        fileExtension = ext as any;
      } else {
        fileExtension = 'auto';
      }
    } else {
      fileExtension = 'auto';
    }

    return {
      cloudName,
      folderPrefix,
      fileExtension,
      sampleCodeOrFilename: sampleCode
    };
  } catch (e) {
    return null;
  }
}

/**
 * Generate targeted candidate URLs for a product on Cloudinary
 * Prioritizing clean root code matching (public_id = itemCode) without Arabic paths
 */
export function getCandidateImageUrls(
  product: Partial<Product>,
  config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG
): string[] {
  const candidates: string[] = [];
  const cloudName = config.cloudName?.trim() || 'dzdkhpr2y';

  // 1. Direct explicit image URL if present
  if (product.imageUrl && product.imageUrl.startsWith('http') && !product.imageUrl.includes('unsplash.com')) {
    candidates.push(product.imageUrl);
  }

  // 2. Select primary identifier: strictly product code or explicit public ID
  let id = '';
  if (product.cloudinaryPublicId) {
    id = product.cloudinaryPublicId.trim();
  } else if (config.matchingPattern === 'name' && product.name) {
    id = sanitizeToCloudinarySlug(product.name);
  } else if (config.matchingPattern === 'slug') {
    id = `${product.code || ''}_${sanitizeToCloudinarySlug(product.name || '')}`;
  } else {
    id = product.code?.trim() || '';
  }

  if (!id) return candidates;

  const folder = config.folderPrefix?.trim() || '';
  const trans = config.defaultTransformation || 'f_auto,q_auto,w_500,c_fill';

  // Clean Root URL Candidates (Best Practice: public_id = itemCode)
  // Candidate 1: Root with configured extension (e.g., .png or .jpg)
  const primaryExt = config.fileExtension && config.fileExtension !== 'auto' ? `.${config.fileExtension}` : '';
  const altExt = primaryExt === '.png' ? '.jpg' : '.png';

  if (!folder) {
    // 1. Root with primary extension
    if (primaryExt) {
      candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodeURIComponent(id)}${primaryExt}`);
    }
    // 2. Root with alternate extension (.jpg / .png)
    candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodeURIComponent(id)}${altExt}`);
    // 3. Root without extension (clean public ID with f_auto)
    candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodeURIComponent(id)}`);
  } else {
    // If user explicitly configured a folder prefix
    if (primaryExt) {
      candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodeURIComponent(folder)}/${encodeURIComponent(id)}${primaryExt}`);
    }
    candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodeURIComponent(folder)}/${encodeURIComponent(id)}${altExt}`);
    candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`);
    // Fallback to clean root just in case
    candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodeURIComponent(id)}${primaryExt || '.png'}`);
  }

  return candidates;
}

/**
 * Generate primary Cloudinary image URL for a given product
 */
export function getProductImageUrl(product: Partial<Product>, config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG): string {
  const candidates = getCandidateImageUrls(product, config);
  if (candidates.length > 0) {
    return candidates[0];
  }
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
