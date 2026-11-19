import React from 'react';
import { Home, Zap, Star, Crown, BadgeCheck } from 'lucide-react';
import type { CustomerTier } from '../../types';
import type { Sector } from '../../data/branchDefinitions';

interface SectorBadgeProps {
  sector?: Sector | null;
  className?: string;
}

/** شارة القطاع (منزلي / كهربائي) — تُستخدم في الكروت والقوائم والبروفايل. */
export const SectorBadge: React.FC<SectorBadgeProps> = ({ sector, className = '' }) => {
  if (!sector) return null;
  const isHome = sector === 'home';
  const Icon = isHome ? Home : Zap;
  return (
    <span
      className={`qops-sector qops-sector--${isHome ? 'home' : 'electrical'} ${className}`.trim()}
      title={isHome ? 'قطاع المنزلي' : 'قطاع الكهرباء'}
    >
      <Icon aria-hidden="true" />
      {isHome ? 'منزلي' : 'كهربائي'}
    </span>
  );
};

interface TierBadgeProps {
  tier?: CustomerTier;
  isKeyAccount?: boolean;
  className?: string;
}

/** شارة فئة العميل: مميز/راقي/متوسط/عادي — «المميز» بتصميم ذهبي بارز. */
export const TierBadge: React.FC<TierBadgeProps> = ({ tier, isKeyAccount, className = '' }) => {
  if (!tier && !isKeyAccount) return null;

  const map: Record<CustomerTier, { cls: string; label: string; Icon: typeof Star }> = {
    'مميز': { cls: 'qops-tier--premium', label: 'مميز', Icon: Crown },
    'راقي': { cls: 'qops-tier--high', label: 'راقي', Icon: Star },
    'متوسط': { cls: 'qops-tier--mid', label: 'متوسط', Icon: BadgeCheck },
    'عادي': { cls: 'qops-tier--basic', label: 'عادي', Icon: Star },
  };

  if (isKeyAccount) {
    return (
      <span className={`qops-tier qops-tier--premium ${className}`.trim()} title="حساب رئيسي">
        <Crown aria-hidden="true" />
        حساب رئيسي
      </span>
    );
  }

  const item = map[tier as CustomerTier];
  if (!item) return null;
  const Icon = item.Icon;
  return (
    <span className={`qops-tier ${item.cls} ${className}`.trim()}>
      <Icon aria-hidden="true" />
      {item.label}
    </span>
  );
};
