import React, { useState, useEffect } from 'react';
import { ImageOff, Sparkles, Package } from 'lucide-react';
import { getProductImageUrl, generateProductPlaceholderSvg } from '../services/cloudinaryService';
import { CloudinaryConfig, Product } from '../types';

interface ProductImageProps {
  product: Partial<Product>;
  cloudinaryConfig: CloudinaryConfig;
  className?: string;
  containerClassName?: string;
  showBadgeOnFallback?: boolean;
  onClick?: () => void;
  alt?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  product,
  cloudinaryConfig,
  className = 'w-full h-full object-cover',
  containerClassName = 'relative w-full h-full bg-slate-900 overflow-hidden flex items-center justify-center',
  showBadgeOnFallback = true,
  onClick,
  alt
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const initialUrl = getProductImageUrl(product, cloudinaryConfig);
  const [src, setSrc] = useState(initialUrl);

  useEffect(() => {
    const newUrl = getProductImageUrl(product, cloudinaryConfig);
    setSrc(newUrl);
    setHasError(false);
    setIsLoading(true);
  }, [product.code, product.imageUrl, product.cloudinaryPublicId, cloudinaryConfig]);

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  // If there's an error loading the external image, render an elegant in-app branded placeholder
  if (hasError || !src) {
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
        src={src}
        alt={alt || product.name || product.code || 'صنف'}
        className={`${className} transition-opacity duration-300 ${isLoading ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}`}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
      />
    </div>
  );
};
