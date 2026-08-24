import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Package } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCandidateImageUrls, generateProductPlaceholderSvg } from '../services/cloudinaryService';
import { CloudinaryConfig, Product } from '../types';

// Global fast in-memory cache to instantly render already verified working image URLs or failed items
const verifiedImageCache = new Map<string, string>();
const failedImageCache = new Set<string>();

interface ProductImageProps {
  product: Partial<Product>;
  cloudinaryConfig?: CloudinaryConfig;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(priority);

  // Cache key per product code and direct imageUrl
  const productKey = useMemo(() => {
    return `${product.code || product.id || 'item'}_${product.imageUrl || ''}`;
  }, [product.code, product.id, product.imageUrl]);

  // Determine optimal size based on variant and data saver mode (optimized for mobile speed)
  const effectiveSize = useMemo(() => {
    if (targetSize) return targetSize;
    if (dataSaverMode) {
      if (sizeVariant === 'thumbnail') return 100;
      if (sizeVariant === 'card') return 180; // Ultra lightweight ~10-15KB WebP for mobile
      return 360; // for modal
    }
    if (sizeVariant === 'thumbnail') return 140;
    if (sizeVariant === 'card') return 220;
    return 500; // modal
  }, [targetSize, sizeVariant, dataSaverMode]);

  // IntersectionObserver for lazy rendering off-screen items
  useEffect(() => {
    if (priority || isInView) return;

    if (!window.IntersectionObserver) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' } // Pre-load when 250px away from viewport
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [priority, isInView]);

  const candidateUrls = useMemo(() => {
    if (!product.imageUrl || !product.imageUrl.trim()) {
      return [];
    }

    // If we already know the exact working URL for this product from cache, put it first
    const cachedWorkingUrl = verifiedImageCache.get(productKey);
    let urls = getCandidateImageUrls(product, cloudinaryConfig);
    
    // Apply dynamic parameter sizing for Google Drive and Google CDN URLs
    const transformed = urls.map((url) => {
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

      return url;
    });

    if (cachedWorkingUrl) {
      return [cachedWorkingUrl, ...transformed.filter((u) => u !== cachedWorkingUrl)];
    }

    return transformed;
  }, [productKey, product.imageUrl, cloudinaryConfig, effectiveSize]);

  const initialExhausted = candidateUrls.length === 0 || failedImageCache.has(productKey);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasExhausted, setHasExhausted] = useState(initialExhausted);
  const [isLoading, setIsLoading] = useState(!verifiedImageCache.has(productKey) && !initialExhausted && candidateUrls.length > 0);

  useEffect(() => {
    if (candidateUrls.length === 0) {
      setHasExhausted(true);
      setIsLoading(false);
      return;
    }

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
    setHasExhausted(false);
    setIsLoading(true);
  }, [productKey, candidateUrls]);

  const currentSrc = candidateUrls[candidateIndex];

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

  // If all candidate URLs failed or no direct link provided, render an instant in-app vector SVG
  if (hasExhausted || !currentSrc) {
    const code = product.code || 'DRM';
    const cat = product.category || product.department || 'دريم للتوزيع';
    const svgFallback = generateProductPlaceholderSvg(code, cat, product.name || '');

    return (
      <div
        ref={containerRef}
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
      ref={containerRef}
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

      {isInView ? (
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
      ) : (
        <div className="w-full h-full bg-slate-50" />
      )}
    </div>
  );
};
