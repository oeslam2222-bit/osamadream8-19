import { CloudinaryConfig, Product } from '../types';

export const DEFAULT_CLOUDINARY_CONFIG: CloudinaryConfig = {
  cloudName: 'dzdkhpr2y',
  folderPrefix: '',
  defaultTransformation: 'f_auto,q_auto,w_500,c_fill',
  matchingPattern: 'auto',
  fileExtension: 'png',
  baseUrlPattern: 'https://res.cloudinary.com/{cloudName}/image/upload/{transformations}/{folder}/{filename}.{extension}'
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
 * Build fast, dynamically compressed Google Drive image URLs with size parameters (e.g. s=200, w=200)
 */
export function buildGoogleDriveCompressedUrls(urlOrId: string, size = 200): string[] {
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
 * Dynamically optimize any image URL (Google Drive, Cloudinary, etc.) for target size and bandwidth savings
 */
export function optimizeImageUrl(rawUrl: string, targetSize = 200, isDataSaver = false): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();

  // Check if it's a Google Drive link
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    const size = isDataSaver ? Math.min(targetSize, 200) : targetSize;
    return `https://lh3.googleusercontent.com/d/${driveId}=s${size}`;
  }

  // Check if it's Cloudinary
  if (trimmed.includes('res.cloudinary.com/') && trimmed.includes('/upload/')) {
    const quality = isDataSaver ? 'eco' : 'auto';
    const size = isDataSaver ? Math.min(targetSize, 240) : targetSize;
    const transformation = `w_${size},c_limit,q_auto:${quality},f_auto`;
    return trimmed.replace(/\/upload\/(?:[^\/]+\/)?/, `/upload/${transformation}/`);
  }

  return trimmed;
}

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
 * Sanitize strings into valid Cloudinary public IDs (clean slug) with customizable separator
 */
export function sanitizeToCloudinarySlug(text: string, separator: '_' | '-' = '_'): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[^\w\u0621-\u064A0-9-_]/g, separator)
    .replace(new RegExp(`\\${separator}+`, 'g'), separator)
    .replace(new RegExp(`^\\${separator}|\\${separator}$`, 'g'), '');
}

/**
 * Encode folder paths preserving '/' between nested subfolders
 * Example: "منزلي/لاينز/defna/14" -> "%D9%85%D9%86%D8%B2%D9%84%D9%8A/%D9%84%D8%A7%D9%8A%D9%86%D8%B2/defna/14"
 */
export function encodeCloudinaryPath(pathStr: string): string {
  if (!pathStr) return '';
  return pathStr
    .split('/')
    .map((seg) => encodeURIComponent(seg.trim()))
    .filter(Boolean)
    .join('/');
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
 * Generate intelligent candidate identifiers (Codes, Arabic Names, Slugs, Composites)
 */
export function generateCandidateIdentifiers(
  product: Partial<Product>,
  pattern: 'auto' | 'code' | 'name' | 'slug' | 'custom_url' = 'auto'
): string[] {
  const ids: string[] = [];

  const code = product.code?.trim() || '';
  const name = product.name?.trim() || '';
  const explicitId = product.cloudinaryPublicId?.trim();

  if (explicitId) {
    ids.push(explicitId);
  }

  // Generate building blocks
  const nameUnderscore = sanitizeToCloudinarySlug(name, '_');
  const nameHyphen = sanitizeToCloudinarySlug(name, '-');
  const composite1 = code && nameUnderscore ? `${code}_-_${nameUnderscore}` : '';
  const composite2 = code && nameUnderscore ? `${code}_${nameUnderscore}` : '';
  const composite3 = code && nameHyphen ? `${code}-${nameHyphen}` : '';

  if (pattern === 'code') {
    if (code) ids.push(code);
    if (composite1) ids.push(composite1);
    if (nameUnderscore) ids.push(nameUnderscore);
  } else if (pattern === 'name') {
    if (nameUnderscore) ids.push(nameUnderscore);
    if (nameHyphen) ids.push(nameHyphen);
    if (composite1) ids.push(composite1);
    if (code) ids.push(code);
  } else if (pattern === 'slug') {
    if (composite1) ids.push(composite1);
    if (composite2) ids.push(composite2);
    if (code) ids.push(code);
    if (nameUnderscore) ids.push(nameUnderscore);
  } else {
    // Default 'auto' Smart Hybrid Strategy:
    // Tries Code first -> Composite (Code + Arabic Name) -> Arabic Name with underscores -> Arabic Name with hyphens
    if (code) ids.push(code);
    if (composite1) ids.push(composite1);
    if (nameUnderscore && !ids.includes(nameUnderscore)) ids.push(nameUnderscore);
    if (nameHyphen && !ids.includes(nameHyphen)) ids.push(nameHyphen);
    if (composite2 && !ids.includes(composite2)) ids.push(composite2);
    if (composite3 && !ids.includes(composite3)) ids.push(composite3);
  }

  return ids.filter(Boolean);
}

/**
 * Intelligently discover and prioritize candidate folder paths for a given product
 * Auto-detects subfolders like منزلي/الفا/LIFESTYLE, منزلي/Casasunco/خلفية بيضاء, منزلي/لاينز/defna/14
 */
export function getCandidateFoldersForProduct(product: Partial<Product>, baseFolder: string): string[] {
  const folders: string[] = [];
  const cleanBase = (baseFolder || '').trim().replace(/\/+$/, '');

  if (cleanBase) {
    folders.push(cleanBase);
  }

  // Common root parent (e.g. "منزلي" if base is "منزلي/الفا/LIFESTYLE" or empty)
  const rootParent = cleanBase.split('/')[0] || 'منزلي';
  if (rootParent && !folders.includes(rootParent)) {
    folders.push(rootParent);
  }

  // Scan text to detect product family/brand
  const textToScan = `${product.name || ''} ${product.department || ''} ${product.category || ''} ${product.classification || ''} ${product.code || ''}`.toLowerCase();

  // Known active brand subdirectories in the company's Cloudinary storage
  const brandSubpaths = [
    'الفا/LIFESTYLE',
    'الفا/خلفية بيضاء',
    'الفا',
    'Casasunco/خلفية بيضاء',
    'Casasunco/LIFESTYLE',
    'Casasunco',
    'لاينز/defna/14',
    'لاينز/defna',
    'لاينز',
    'defna/14',
    'defna',
    'دريم',
    'لوتس',
    'جرانيت',
    'تيفلون',
    'زجاج',
    'صيني'
  ];

  for (const sub of brandSubpaths) {
    const fullPath = rootParent ? `${rootParent}/${sub}` : sub;
    if (!folders.includes(fullPath)) {
      // Prioritize if product name/category matches the brand
      const isMatch =
        (sub.includes('الفا') && (textToScan.includes('الفا') || textToScan.includes('alfa'))) ||
        (sub.includes('Casasunco') && (textToScan.includes('casasunco') || textToScan.includes('كاساسونكو'))) ||
        (sub.includes('لاينز') && (textToScan.includes('لاينز') || textToScan.includes('lines'))) ||
        (sub.includes('defna') && (textToScan.includes('defna') || textToScan.includes('دفنا') || textToScan.includes('14'))) ||
        (sub.includes('دريم') && textToScan.includes('دريم')) ||
        (sub.includes('لوتس') && (textToScan.includes('لوتس') || textToScan.includes('lotus'))) ||
        (sub.includes('جرانيت') && textToScan.includes('جرانيت')) ||
        (sub.includes('تيفلون') && textToScan.includes('تيفلون')) ||
        (sub.includes('زجاج') && textToScan.includes('زجاج'));

      if (isMatch) {
        // Insert at very top
        folders.unshift(fullPath);
      } else {
        folders.push(fullPath);
      }
    }
  }

  // Also include root folder
  if (!folders.includes('')) {
    folders.push('');
  }

  return Array.from(new Set(folders));
}

/**
 * Generate targeted candidate URLs for a product on Cloudinary
 * Matching by Code OR Arabic Product Name OR Composite Slug across all relevant subfolders
 */
export function getCandidateImageUrls(
  product: Partial<Product>,
  config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG
): string[] {
  const candidates: string[] = [];
  const cloudName = config.cloudName?.trim() || 'dzdkhpr2y';

  // 1. Direct explicit image URL if present (Google Drive or Cloudinary or Web CDN)
  if (product.imageUrl && product.imageUrl.startsWith('http') && !product.imageUrl.includes('unsplash.com')) {
    // If it's a Google Drive link, expand to high-speed compressed CDN URLs with s=200/w=200
    const driveUrls = buildGoogleDriveCompressedUrls(product.imageUrl, 240);
    if (driveUrls.length > 0) {
      candidates.push(...driveUrls);
    } else {
      candidates.push(product.imageUrl);
    }
  }

  // 2. Extract smart identifiers (Code, Arabic Name variations, Composites)
  const identifiers = generateCandidateIdentifiers(product, config.matchingPattern || 'auto');
  if (identifiers.length === 0) return candidates;

  const trans = config.defaultTransformation || 'f_auto,q_auto,w_500,c_fill';
  const primaryExt = config.fileExtension && config.fileExtension !== 'auto' ? `.${config.fileExtension}` : '';
  const altExt = primaryExt === '.png' ? '.jpg' : '.png';

  // 3. Get all relevant folders (e.g. automatically checking الفا, Casasunco, لاينز, defna, etc.)
  const candidateFolders = getCandidateFoldersForProduct(product, config.folderPrefix || '');

  for (const folder of candidateFolders) {
    const encodedFolderPart = folder ? encodeCloudinaryPath(folder) + '/' : '';

    for (const id of identifiers) {
      const encodedId = encodeURIComponent(id);

      if (primaryExt) {
        candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodedFolderPart}${encodedId}${primaryExt}`);
      }
      candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodedFolderPart}${encodedId}${altExt}`);
      candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${trans}/${encodedFolderPart}${encodedId}`);
    }
  }

  // De-duplicate URLs
  return Array.from(new Set(candidates));
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
