import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ImageOff, Sparkles, Package } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCandidateImageUrls, generateProductPlaceholderSvg } from '../services/cloudinaryService';
import { CloudinaryConfig, Product } from '../types';

// Global fast in-memory cache to instantly render already verified working image URLs or failed items
const verifiedImageCache = new Map<string, string>();
const failedImageCache = new Set<string>();

interface ProductImageProps {
  product: Partial<Product>;
  cloudinaryConfig: CloudinaryConfig;
  className?: string;
  containerClassName?: string;
  showBadgeOnFallback?: boolean;
  targetSize?: number;
  sizeVariant?: 'thumbnail' | 'card' | 'modal' | 'full';
  fitMode?: 'cover' | 'contain';
  onClick?: () => void;
  alt?: string;
  priority?: boolean;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  product,
  cloudinaryConfig,
  className = 'w-full h-full object-contain',
  containerClassName = 'relative w-full h-full bg-gradient-to-br from-slate-50 via-slate-100/70 to-amber-50/20 overflow-hidden flex items-center justify-center',
  showBadgeOnFallback = true,
  targetSize,
  sizeVariant = 'card',
  fitMode = 'contain',
  onClick,
  alt,
  priority = false,
}) => {
  const { dataSaverMode } = useApp();

  // Cache key per product code and cloud configuration
  const productKey = useMemo(() => {
    return `${product.code || product.id || 'item'}_${product.imageUrl || ''}_${cloudinaryConfig.cloudName || ''}`;
  }, [product.code, product.id, product.imageUrl, cloudinaryConfig.cloudName]);

  // Determine optimal size based on variant and data saver mode
  const effectiveSize = useMemo(() => {
    if (targetSize) return targetSize;
    if (dataSaverMode) {
      if (sizeVariant === 'thumbnail') return 120;
      if (sizeVariant === 'card') return 200; // Lightweight ~15KB WebP
      return 400; // for modal
    }
    if (sizeVariant === 'thumbnail') return 160;
    if (sizeVariant === 'card') return 260;
    return 600; // modal
  }, [targetSize, sizeVariant, dataSaverMode]);

  const candidateUrls = useMemo(() => {
    // If we already know the exact working URL for this product from cache, put it first
    const cachedWorkingUrl = verifiedImageCache.get(productKey);
    let urls = getCandidateImageUrls(product, cloudinaryConfig);
    
    // Apply dynamic parameter sizing for Google Drive and Cloudinary
    const transformed = urls.map(url => {
      // 1. Google Drive & Google CDN URLs (Dynamic compression parameter s=220 or sz=w220)
      if (url.includes('googleusercontent.com/d/')) {
        if (url.includes('=s') || url.includes('=w')) {
          return url.replace(/=(s|w)\d+[^&]*/, `=s${effectiveSize}`);
        }
        return `${url}=s${effectiveSize}`;
      }

      if (url.includes('drive.google.com/thumbnail')) {
        if (url.includes('&s=') || url.includes('&sz=')) {
          return url.replace(/&(s|sz)=[^&]+/, `&sz=w${effectiveSize}-h${effectiveSize}`);
        }
        return `${url}&sz=w${effectiveSize}-h${effectiveSize}`;
      }

      // 2. Cloudinary URLs (Auto WebP, auto quality good/eco, exact bounded width)
      if (url.includes('res.cloudinary.com/') && url.includes('/upload/')) {
        const quality = dataSaverMode ? 'eco' : 'good';
        // Check if already transformed or clean upload
        if (url.includes('/upload/q_auto') || url.includes('/upload/f_auto')) {
          return url.replace(/\/upload\/(?:[^\/]+\/)?/, `/upload/f_auto,q_auto:${quality},w_${effectiveSize}/`);
        }
        return url;
      }

      return url;
    });

    if (cachedWorkingUrl) {
      return [cachedWorkingUrl, ...transformed.filter(u => u !== cachedWorkingUrl)];
    }

    return transformed;
  }, [productKey, product.code, product.name, product.imageUrl, product.cloudinaryPublicId, cloudinaryConfig, dataSaverMode, effectiveSize]);

  const initialExhausted = failedImageCache.has(productKey) && candidateUrls.length === 0;
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasExhausted, setHasExhausted] = useState(initialExhausted);
  const [isLoading, setIsLoading] = useState(!verifiedImageCache.has(productKey) && !initialExhausted && candidateUrls.length > 0);

  useEffect(() => {
    if (verifiedImageCache.has(productKey)) {
      setCandidateIndex(0);
      setHasExhausted(false);
      setIsLoading(false);
      return;
    }

    if (failedImageCache.has(productKey)) {
      setHasExhausted(true);
      setIsLoading(false);
      return;
    }

    setCandidateIndex(0);
    setHasExhausted(candidateUrls.length === 0);
    setIsLoading(candidateUrls.length > 0);
  }, [productKey, candidateUrls]);

  const currentSrc = candidateUrls[candidateIndex];

  // Preload next candidate quickly if current is taking time
  useEffect(() => {
    if (!currentSrc || verifiedImageCache.has(productKey) || hasExhausted) return;

    let isMounted = true;
    const img = new Image();
    img.src = currentSrc;
    img.onload = () => {
      if (isMounted) {
        verifiedImageCache.set(productKey, currentSrc);
        setIsLoading(false);
        setHasExhausted(false);
      }
    };
    img.onerror = () => {
      if (isMounted) {
        if (candidateIndex + 1 < candidateUrls.length) {
          setCandidateIndex((prev) => prev + 1);
        } else {
          failedImageCache.add(productKey);
          setHasExhausted(true);
          setIsLoading(false);
        }
      }
    };

    return () => {
      isMounted = false;
    };
  }, [currentSrc, candidateIndex, candidateUrls.length, productKey, hasExhausted]);

  const handleError = () => {
    if (candidateIndex + 1 < candidateUrls.length) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      failedImageCache.add(productKey);
      setHasExhausted(true);
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    if (currentSrc) {
      verifiedImageCache.set(productKey, currentSrc);
    }
    setIsLoading(false);
    setHasExhausted(false);
  };

  // If all candidate URLs failed or no candidates, render an instant, lightweight in-app SVG
  if (hasExhausted || !currentSrc) {
    const code = product.code || 'DRM';
    const cat = product.category || product.department || 'دريم للتوزيع';
    const svgFallback = generateProductPlaceholderSvg(code, cat, product.name || '');

    return (
      <div
        className={`${containerClassName} cursor-pointer group`}
        onClick={onClick}
      >
        <img
          src={svgFallback}
          alt={alt || product.name || code}
          className={`${className} ${fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${containerClassName} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Animated Fast Shimmer Skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-slate-100 via-amber-50/60 to-slate-100 animate-pulse flex items-center justify-center z-0">
          <div className="flex flex-col items-center gap-1 opacity-30">
            <Package className="w-5 h-5 text-amber-600 animate-bounce" />
          </div>
        </div>
      )}

      <img
        key={currentSrc}
        src={currentSrc}
        alt={alt || product.name || product.code || 'صنف'}
        className={`${className} ${fitMode === 'contain' ? 'object-contain' : 'object-cover'} transition-opacity duration-200 ${
          isLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        onError={handleError}
        onLoad={handleLoad}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

