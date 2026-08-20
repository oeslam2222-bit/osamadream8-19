// Offline Image Caching and Data Saver Utility for Sales Reps

const CACHE_NAME = 'dream-tantawy-images-v1';

/**
 * Check if Cache API is supported in browser
 */
export function isCacheSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

/**
 * Preload and cache product images to device storage so they never redownload
 */
export async function cacheProductImages(imageUrls: string[]): Promise<{ cached: number; total: number }> {
  if (!isCacheSupported()) return { cached: 0, total: imageUrls.length };

  try {
    const cache = await caches.open(CACHE_NAME);
    let successCount = 0;

    const validUrls = imageUrls.filter(url => url && url.startsWith('http') && !url.startsWith('data:'));
    
    // Process in batches of 6 for network speed
    for (let i = 0; i < validUrls.length; i += 6) {
      const batch = validUrls.slice(i, i + 6);
      await Promise.allSettled(
        batch.map(async (url) => {
          const match = await cache.match(url);
          if (!match) {
            try {
              const res = await fetch(url, { mode: 'no-cors' });
              if (res) {
                await cache.put(url, res);
                successCount++;
              }
            } catch (e) {
              // Ignore single image failure
            }
          } else {
            successCount++;
          }
        })
      );
    }

    return { cached: successCount, total: validUrls.length };
  } catch (e) {
    return { cached: 0, total: imageUrls.length };
  }
}

/**
 * Get count and estimated size of cached images on device
 */
export async function getCachedImagesStats(): Promise<{ count: number; estimatedSizeMB: number }> {
  if (!isCacheSupported()) return { count: 0, estimatedSizeMB: 0 };

  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    // Approximate 35KB per cached thumbnail
    const estimatedSizeMB = Math.round((keys.length * 0.035) * 10) / 10;
    return { count: keys.length, estimatedSizeMB };
  } catch (e) {
    return { count: 0, estimatedSizeMB: 0 };
  }
}

/**
 * Clear offline cached images to free up phone storage
 */
export async function clearCachedImages(): Promise<boolean> {
  if (!isCacheSupported()) return false;
  try {
    await caches.delete(CACHE_NAME);
    return true;
  } catch (e) {
    return false;
  }
}
