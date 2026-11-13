import { CloudinaryConfig, Product } from '../types';

export const DEFAULT_CLOUDINARY_CONFIG: CloudinaryConfig = {
  cloudName: 'drke4xlgb',
  uploadPreset: 'DREAMOSAMA',
  folderPrefix: 'customer_photos',
  defaultTransformation: 'w_800,c_limit,q_auto:good,f_auto',
  matchingPattern: 'auto',
  fileExtension: 'auto',
  baseUrlPattern: ''
};

/**
 * تطبيع إعدادات Cloudinary المخزنة (localStorage / حالة التطبيق):
 * أي حقل مفقود أو فاضي بيرجع للقيمة الافتراضية بدل ما يفضل فاضي،
 * لأن القيم القديمة المحفوظة من نسخ سابقة كانت بتوقف الرفع بخطأ
 * "cloudName ناقص" حتى مع وجود إعداد افتراضي صالح في الكود.
 */
export function normalizeCloudinaryConfig(
  input?: Partial<CloudinaryConfig> | null
): CloudinaryConfig {
  const src: Partial<CloudinaryConfig> =
    input && typeof input === 'object' ? input : {};

  const pickString = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

  const matchingPattern = src.matchingPattern;
  const fileExtension = src.fileExtension;

  return {
    cloudName: pickString(src.cloudName, DEFAULT_CLOUDINARY_CONFIG.cloudName),
    uploadPreset: pickString(src.uploadPreset, DEFAULT_CLOUDINARY_CONFIG.uploadPreset as string),
    folderPrefix: pickString(src.folderPrefix, DEFAULT_CLOUDINARY_CONFIG.folderPrefix),
    defaultTransformation: pickString(
      src.defaultTransformation,
      DEFAULT_CLOUDINARY_CONFIG.defaultTransformation
    ),
    matchingPattern:
      matchingPattern === 'auto' ||
      matchingPattern === 'code' ||
      matchingPattern === 'name' ||
      matchingPattern === 'slug' ||
      matchingPattern === 'custom_url'
        ? matchingPattern
        : DEFAULT_CLOUDINARY_CONFIG.matchingPattern,
    fileExtension:
      fileExtension === 'jpg' ||
      fileExtension === 'png' ||
      fileExtension === 'webp' ||
      fileExtension === 'auto'
        ? fileExtension
        : DEFAULT_CLOUDINARY_CONFIG.fileExtension,
    baseUrlPattern: typeof src.baseUrlPattern === 'string'
      ? src.baseUrlPattern
      : DEFAULT_CLOUDINARY_CONFIG.baseUrlPattern,
  };
}

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
 * Optimizes Cloudinary URLs with modern high-fidelity compression parameters (w_550, c_limit, q_auto, f_auto)
 */
export function optimizeCloudinaryUrl(url: string, targetSize = 550): string {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  const trimmed = url.trim();
  // Check if /upload/ is present
  const uploadIndex = trimmed.indexOf('/upload/');
  if (uploadIndex === -1) return trimmed;

  const prefix = trimmed.substring(0, uploadIndex + 8);
  const suffix = trimmed.substring(uploadIndex + 8);

  // If already has transformation parameters right after /upload/, replace them
  if (/^[a-zA-Z0-9_,.-]+\//.test(suffix) && !suffix.startsWith('v')) {
    const nextSlash = suffix.indexOf('/');
    const rest = suffix.substring(nextSlash + 1);
    return `${prefix}w_${targetSize},c_limit,q_auto,f_auto/${rest}`;
  }

  // Insert crisp modern transformation
  return `${prefix}w_${targetSize},c_limit,q_auto,f_auto/${suffix}`;
}

/**
 * Build fast, dynamically compressed Google Drive image URLs with size parameters (e.g. s=550, w=550)
 */
export function buildGoogleDriveCompressedUrls(urlOrId: string, size = 550): string[] {
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
 * Dynamically optimize any image URL (Google Drive, Cloudinary, direct links) for target size and bandwidth savings
 */
export function optimizeImageUrl(rawUrl: string, targetSize = 550, isDataSaver = false): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();

  // Check if it's Cloudinary
  if (trimmed.includes('res.cloudinary.com')) {
    const size = isDataSaver ? Math.min(targetSize, 260) : targetSize;
    return optimizeCloudinaryUrl(trimmed, size);
  }

  // Check if it's a Google Drive link
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    const size = isDataSaver ? Math.min(targetSize, 240) : targetSize;
    return `https://lh3.googleusercontent.com/d/${driveId}=s${size}`;
  }

  return trimmed;
}

/**
 * Generate a clean, bright, branded SVG placeholder image when no image is available
 */
/**
 * صورة محل بديلة للعملاء الذين لا توجد لهم صورة محل (بديلة للـUnsplash).
 * تُنشأ محلياً كـdata URI — صفر بايت من استهلاك الشبكة والـCDN.
 */
export function generateStorePlaceholderSvg(name: string, seed = 0): string {
  const palettes = [
    ['#1E3A8A', '#3B82F6'],
    ['#0F766E', '#14B8A6'],
    ['#B45309', '#F59E0B'],
    ['#7C3AED', '#A78BFA'],
    ['#B91C1C', '#F87171'],
    ['#0F2B38', '#38BDF8'],
  ];
  const idx = Math.abs(seed) % palettes.length;
  const [deep, light] = palettes[idx];
  const initial = (name || '?').trim().charAt(0) || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></linearGradient></defs><rect width="160" height="160" fill="url(#bg)"/><g fill="#ffffff" opacity="0.55"><polygon points="30,86 80,42 130,86"/><rect x="42" y="86" width="76" height="48" rx="6"/></g><rect x="68" y="108" width="24" height="26" rx="3" fill="${deep}" opacity="0.9"/><text x="80" y="72" font-family="Cairo, Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff" text-anchor="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

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
    const driveUrls = buildGoogleDriveCompressedUrls(rawUrl, 550);
    if (driveUrls.length > 0) {
      candidates.push(...driveUrls);
    } else if (rawUrl.includes('res.cloudinary.com')) {
      candidates.push(optimizeCloudinaryUrl(rawUrl, 550));
      candidates.push(rawUrl);
    } else if (rawUrl.startsWith('http')) {
      candidates.push(rawUrl);
    }
  }

  // 2. Cloudinary fallback مربوط بكود المنتج — الكود ثابت وفريد، فمفيش مخاطرة
  //    إن الصورة تتلقط باسم غلط زي ما بيحصل لو الربط كان بالمسي العربي الحر.
  const publicId = typeof product.cloudinaryPublicId === 'string' ? product.cloudinaryPublicId.trim() : '';
  if (publicId) {
    const { cloudName } = normalizeCloudinaryConfig(_config);
    if (cloudName) {
      candidates.push(`https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`);
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

/**
 * ترفع صورة إلى Cloudinary باستخدام الإعدادات الموجودة في النظام.
 * ترجع رابط الصورة المرفوع (secure_url) أو تُرمي خطأً إذا فشل الرفع.
 * تحتاج إلى أن يكون cloudinaryConfig مفعّلاً (cloudName و uploadPreset على الأقل).
 */
export async function uploadImageToCloudinary(
  file: File,
  config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG,
  folder = 'tantawy_visits'
): Promise<{ url: string; publicId?: string }> {
  // تطبيع الإعدادات: حتى لو المُتصل مرر كائن ناقص (مثل قيمة قديمة من localStorage)
  // بنرجع للإعداد الافتراضي الصالح بدل ما نضرب خطأ "cloudName ناقص".
  const effectiveConfig = normalizeCloudinaryConfig(config);
  const uploadPreset = effectiveConfig.uploadPreset || 'unsigned_preset';
  const uploadUrl = `https://api.cloudinary.com/v1_1/${effectiveConfig.cloudName}/image/upload`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', folder);
  // ممنوع إرسال transformation مع الرفع غير الموقّع (unsigned):
  // Cloudinary بيرفضه بـ400 "Transformation parameter is not allowed when using unsigned upload".
  // التحويل بيتم وقت العرض عبر optimizeCloudinaryUrl أو من إعدادات الـupload preset نفسه.

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`فشل رفع الصورة إلى Cloudinary: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    secure_url?: string;
    public_id?: string;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(data.error.message || 'فشل رفع الصورة إلى Cloudinary.');
  }

  if (!data.secure_url) {
    throw new Error('لم يتم إرجاع رابط الصورة من Cloudinary.');
  }

  return { url: data.secure_url, publicId: data.public_id };
}

/**
 * تضغط صورة باستخدام canvas قبل الرفع إلى Cloudinary.
 * الهدف: تقليل الحجم إلى حوالي 100-150 كيلو بايت للصورة الواحدة
 * مع الحفاظ على جودة مقبولة للعرض على الموبايل واللاب توب.
 */
export function compressImageFile(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // حساب الأبعاد الجديدة مع الحفاظ على النسبة
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('تعذر إنشاء سياق الرسم لضغط الصورة'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('فشل ضغط الصورة'));
            return;
          }
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('فشل تحميل الصورة للضغط'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * ترفع صورة عميل إلى Cloudinary بعد ضغطها (~100 كيلوبايت).
 * تُخزّن في مجلد customer_photos مرتباً بكود العميل ومعرفه لسهولة الأرشفة.
 */
export async function uploadCustomerPhoto(
  file: File,
  config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG,
  customerId: string,
  customerCode?: string,
  customerName?: string
): Promise<{ url: string; publicId?: string }> {
  const compressed = await compressImageFile(file, 800, 800, 0.7);
  const cleanCode = (customerCode || customerId || 'cust').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetFolder = `customer_photos/${cleanCode}`;
  return uploadImageToCloudinary(compressed, config, targetFolder);
}

/**
 * ترفع صورة منتج إلى Cloudinary مرتبة بكود المنتج (public_id = الكود).
 * الكود ثابت وفريد، فالصورة تفضل مربوطة بالمنتج حتى لو اتغير الاسم.
 */
export async function uploadProductPhoto(
  file: File,
  config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG,
  productCode: string,
  productId?: string
): Promise<{ url: string; publicId?: string }> {
  const compressed = await compressImageFile(file, 800, 800, 0.7);
  const cleanCode = (productCode || productId || 'product').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetFolder = `product_photos/${cleanCode}`;
  const result = await uploadImageToCloudinary(compressed, config, targetFolder);
  return { ...result, publicId: result.publicId || cleanCode };
}

/**
 * ترفع وتضغط صورة الملف الشخصي للمندوب أو المستخدم إلى Cloudinary (أقل من 40 كيلوبايت).
 * ترفع مرة واحدة وتُحفظ برابط دائم يخدم من CDN كلوديناري بدون استهلاك أي بايت من رصيد Supabase Egress.
 */
export async function uploadUserAvatar(
  file: File,
  userId: string,
  config: CloudinaryConfig = DEFAULT_CLOUDINARY_CONFIG
): Promise<{ url: string; publicId?: string }> {
  const compressed = await compressImageFile(file, 320, 320, 0.75);
  const cleanId = (userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetFolder = `user_avatars/${cleanId}`;
  return uploadImageToCloudinary(compressed, config, targetFolder);
}

