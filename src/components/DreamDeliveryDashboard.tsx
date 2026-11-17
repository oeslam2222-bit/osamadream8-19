import React, { useMemo, useState } from 'react';
import {
  ShoppingCart, Wallet, PackageSearch, MapPin, RotateCcw, TrendingUp,
  Users, Target, CalendarCheck, ReceiptText,
  Activity, Boxes, Flame,
  Sparkles, CreditCard, AlertTriangle, Coins, ArrowLeft, Tag,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { filterPromotionsForUser } from '../services/promotionService';
import type { Invoice } from '../types';

interface DreamDeliveryDashboardProps {
  onNavigate?: (tab: string) => void;
  onNewOrder?: () => void;

}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function fmt(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function invoiceMonth(invoice: Invoice): string {
  const raw = invoice.date || invoice.createdAt || '';
  const match = String(raw).match(/(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function invoiceValue(invoice: Invoice): number {
  return Number(invoice.totalAmount ?? invoice.estimatedGrandTotal ?? 0) || 0;
}

export const DreamDeliveryDashboard: React.FC<DreamDeliveryDashboardProps> = ({ onNavigate }) => {
  const {
    currentUser,
    invoices,
    customers,
    visibleVisits,
    targets,
    promotions,
    products,
    getVisibleInvoices,
    getVisibleCustomers,
    getVisibleTargets,
  } = useApp();

  const visibleInvoices = useMemo(() => getVisibleInvoices(), [invoices, currentUser?.id, currentUser?.role, currentUser?.branchName]);
  const visibleCustomers = useMemo(() => getVisibleCustomers(), [customers, currentUser?.id, currentUser?.role, currentUser?.branchName]);
  const visibleTargetRows = useMemo(() => getVisibleTargets(), [targets, currentUser?.id, currentUser?.role, currentUser?.branchName]);

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const latestPeriod = useMemo(() => {
    let latest: { year: number; month: number; key: string } | null = null;
    for (const row of visibleTargetRows) {
      const year = Number(row.year);
      const month = Number(row.month);
      if (!year || !month) continue;
      if (!latest || year > latest.year || (year === latest.year && month > latest.month)) {
        latest = { year, month, key: monthKey(year, month) };
      }
    }
    if (latest) return latest;
    return { year: today.getFullYear(), month: today.getMonth() + 1, key: todayKey.slice(0, 7) };
  }, [visibleTargetRows]);

  const monthRows = useMemo(
    () => visibleTargetRows.filter((r) => Number(r.year) === latestPeriod.year && Number(r.month) === latestPeriod.month),
    [visibleTargetRows, latestPeriod.year, latestPeriod.month]
  );

  const monthSales = monthRows.reduce((sum, r) => sum + (Number(r.salesAchieved) || 0), 0);
  const monthSalesTarget = monthRows.reduce((sum, r) => sum + (Number(r.salesTarget) || 0), 0);
  const monthCollection = monthRows.reduce((sum, r) => sum + (Number(r.collectionAchieved) || 0), 0);
  const monthCollectionTarget = monthRows.reduce((sum, r) => sum + (Number(r.collectionTarget) || 0), 0);

  const salesPercent = monthSalesTarget > 0 ? Math.round((monthSales / monthSalesTarget) * 100) : 0;
  const collectionPercent = monthCollectionTarget > 0 ? Math.round((monthCollection / monthCollectionTarget) * 100) : 0;
  const salesRemaining = Math.max(0, monthSalesTarget - monthSales);
  const collectionRemaining = Math.max(0, monthCollectionTarget - monthCollection);

  const periodInvoices = useMemo(
    () => visibleInvoices.filter((inv) => invoiceMonth(inv) === latestPeriod.key),
    [visibleInvoices, latestPeriod.key]
  );

  const ordersToday = useMemo(
    () => visibleInvoices.filter((inv) => String(inv.date || '').slice(0, 10) === todayKey),
    [visibleInvoices, todayKey]
  );

  const returnsCount = useMemo(() => {
    const keys = new Set<string>();
    visibleInvoices.forEach((inv) => {
      if (inv.hasReturns || inv.status === 'مرتجع' || inv.status === 'مرتجع جزئي') keys.add(inv.id);
