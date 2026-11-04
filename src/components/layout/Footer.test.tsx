import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Footer } from './Footer';

describe('Footer', () => {
  it('يريد عرض نص نظام إدارة المبيعات', () => {
    render(<Footer />);
    expect(screen.getByText('نظام إدارة المبيعات والمخازن والربط السحابي وتوفير الباقة')).toBeInTheDocument();
  });

  it('يعرض اسم مجموعة الطنطاوي', () => {
    render(<Footer />);
    expect(screen.getByText('مجموعة الطنطاوي للتجارة والتوزيع')).toBeInTheDocument();
  });

  it('يدعم الوضع الداكن', () => {
    render(<Footer isDark={true} />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveClass('bg-slate-950');
  });
});