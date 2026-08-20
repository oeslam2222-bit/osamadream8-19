import React, { useState, useEffect, useMemo } from 'react';
import { ImageOff, Sparkles, Package } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCandidateImageUrls, generateProductPlaceholderSvg } from '../services/cloudinaryService';
import { CloudinaryConfig, Product } from '../types';

interface ProductImageProps {
  product: Partial<Product>;
  cloudinaryConfig: CloudinaryConfig;
  className?: string;
  containerClassName?: string;
  showBadgeOnFallback?: boolean;
  targetSize?: number;
  sizeVariant?: 'thumbnail' | 'card' | 'modal' | 'full';
  onClick?: () => void;
  alt?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  product,
  cloudinaryConfig,
  className = 'w-full h-full object-cover',
  containerClassName = 'relative w-full h-full bg-slate-900 overflow-hidden flex items-center justify-center',
  showBadgeOnFallback = true,
  targetSize,
  sizeVariant = 'card',
  onClick,
  alt
}) => {
  const { dataSaverMode } = useApp();

  // Determine optimal size based on variant and data saver mode
  const effectiveSize = useMemo(() => {
    if (targetSize) return targetSize;
    if (dataSaverMode) {
      if (sizeVariant === 'thumbnail') return 120;
      if (sizeVariant === 'card') return 200; // Compressed s=200 for phone catalog cards
      return 400; // for modal
    }
    if (sizeVariant === 'thumbnail') return 180;
    if (sizeVariant === 'card') return 360;
    return 800; // modal
  }, [targetSize, sizeVariant, dataSaverMode]);

  const candidateUrls = useMemo(() => {
    let urls = getCandidateImageUrls(product, cloudinaryConfig);
    
    // Apply dynamic parameter sizing for Google Drive and Cloudinary
    return urls.map(url => {
      // 1. Google Drive & Google CDN URLs (Dynamic compression parameter s=200 or sz=w200)
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

      // 2. Cloudinary URLs
      if (url.includes('res.cloudinary.com/') && url.includes('/upload/')) {
        const quality = dataSaverMode ? 'eco' : 'auto';
        return url.replace(/\/upload\/[^/]+\//, `/upload/f_auto,q_auto:${quality},w_${effectiveSize},c_limit/`);
      }

      return url;
    });
  }, [product.code, product.name, product.imageUrl, product.cloudinaryPublicId, cloudinaryConfig, dataSaverMode, effectiveSize]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasExhausted, setHasExhausted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setCandidateIndex(0);
    setHasExhausted(candidateUrls.length === 0);
    setIsLoading(candidateUrls.length > 0);
  }, [candidateUrls]);

  const currentSrc = candidateUrls[candidateIndex];

  const handleError = () => {
    if (candidateIndex + 1 < candidateUrls.length) {
      // Try next candidate format (e.g. without extension, in another folder, etc.)
      setCandidateIndex((prev) => prev + 1);
    } else {
      // All candidates exhausted, show fallback
      setHasExhausted(true);
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
    setHasExhausted(false);
  };

  // If all candidate URLs failed, render an elegant in-app branded placeholder
  if (hasExhausted || !currentSrc) {
    const code = product.code || 'DRM';
    const cat = product.category || product.department || 'دريم';
    const svgFallback = generateProductPlaceholderSvg(code, cat, product.name || '');

    return (
      <div
        className={`${containerClassName} cursor-pointer group`}
        onClick={onClick}
      >
        <img
          src={svgFallback}
          alt={alt || product.name || code}
          className={className}
        />
        {showBadgeOnFallback && (
          <div className="absolute inset-0 bg-slate-950/20 flex flex-col items-center justify-center p-2 text-center pointer-events-none">
            <span className="bg-amber-400 text-slate-950 text-[10px] sm:text-xs font-black px-2 py-0.5 rounded shadow">
              {code}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${containerClassName} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <img
        key={currentSrc}
        src={currentSrc}
        alt={alt || product.name || product.code || 'صنف'}
        className={`${className} transition-opacity duration-300 ${isLoading ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}`}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
      />
    </div>
  );
};
