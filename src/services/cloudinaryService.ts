import { CloudinaryConfig, Product } from '../types';

export const DEFAULT_CLOUDINARY_CONFIG: CloudinaryConfig = {
  cloudName: 'dream-distribution',
  folderPrefix: 'products',
  defaultTransformation: 'f_auto,q_auto,w_500,c_fill',
  matchingPattern: 'code',
  fileExtension: 'jpg',
  baseUrlPattern: 'https://res.cloudinary.com/{cloudName}/image/upload/{transformations}/{folder}/{filename}.{extension}'
};

// Fallback high quality placeholder images for Dream distribution categories
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  'بسكويت وويفر': 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=80',
  'شوكولاتة وحلويات': 'https://images.unsplash.com/photo-1548741487-18d16a1a083c?w=500&auto=format&fit=crop&q=80',
  'زيوت وسمن': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80',
  'منظفات وعناية': 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=500&auto=format&fit=crop&q=80',
  'عصائر ومشروبات': 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop&q=80',
  'معلبات وبقوليات': 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?w=500&auto=format&fit=crop&q=80',
  'ألبان وأجبان': 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=500&auto=format&fit=crop&q=80',
  'سناكس وشيبسي': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=500&auto=format&fit=crop&q=80',
};

const DEFAULT_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80';

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
  // 1. If product already has an explicit direct valid URL, use it
  if (product.imageUrl && product.imageUrl.startsWith('http')) {
    return product.imageUrl;
  }

  // 2. If product has a specific cloudinary public ID
  if (product.cloudinaryPublicId) {
    const folderPart = config.folderPrefix ? `${config.folderPrefix}/` : '';
    return `https://res.cloudinary.com/${config.cloudName}/image/upload/${config.defaultTransformation}/${folderPart}${product.cloudinaryPublicId}`;
  }

  // 3. Auto-match by code or name
  let identifier = '';
  if (config.matchingPattern === 'code' && product.code) {
    identifier = product.code.trim();
  } else if (config.matchingPattern === 'name' && product.name) {
    identifier = sanitizeToCloudinarySlug(product.name);
  } else if (config.matchingPattern === 'slug') {
    identifier = `${product.code || ''}_${sanitizeToCloudinarySlug(product.name || '')}`;
  } else {
    identifier = product.code || sanitizeToCloudinarySlug(product.name || 'product');
  }

  // If we have an identifier and a configured cloud name, generate the Cloudinary URL
  if (identifier && config.cloudName && config.cloudName !== 'demo') {
    const ext = config.fileExtension === 'auto' ? '' : `.${config.fileExtension}`;
    const folderPart = config.folderPrefix ? `${config.folderPrefix}/` : '';
    return `https://res.cloudinary.com/${config.cloudName}/image/upload/${config.defaultTransformation}/${folderPart}${identifier}${ext}`;
  }

  // 4. Fallback to category visual image
  if (product.category && CATEGORY_PLACEHOLDERS[product.category]) {
    return CATEGORY_PLACEHOLDERS[product.category];
  }

  return DEFAULT_FALLBACK_IMAGE;
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

  products.forEach((p, idx) => {
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
