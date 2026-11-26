import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { KpiCard } from './ui/KpiCard';
import '../styles/ui-polish.css';
import { formatCurrency } from '../services/invoiceService';
import {
  getQueuedMutations,
  isDeadLetter,
  MAX_ATTEMPTS,
  type QueueEntity,
  type QueuedMutation,
} from '../services/offlineQueueService';
import type {
  CollectionForecastRecord,
  Customer,
  CustomerCommentRecord,
  CustomerVisit,
  Invoice,
  User,
} from '../types';

type QueueSource = 'outbox' | 'pending_invoice';
type FilterMode = 'all' | 'outbox' | 'invoices' | 'failed';

interface UnifiedPendingItem {
  uid: string;
  rawId: string;
  source: QueueSource;
  entity: QueueEntity | 'pending_invoice';
  op: 'upsert' | 'delete' | 'replace' | 'invoice_create';
  entityId: string;
  queuedAt: number;
  attempts: number;
  isDead: boolean;
  hasError: boolean;
  lastError?: string;
  sizeBytes: number;
  heavyEgress: boolean;
  title: string;
  summary: string;
  payloadPreview: unknown;
}

const ENTITY_LABELS: Record<string, string> = {
  pending_invoice: 'فاتورة أوفلاين',
  invoices: 'أمر بيع / فاتورة',
  visits: 'زيارة / تحصيل / مرتجع',
  customers: 'عميل',
  users: 'حساب موظف',
  products: 'كتالوج الأصناف',
  targets: 'جدول الأهداف',
  forecasts: 'توقع تحصيل',
  forecast_plans: 'خطة تحصيل شهرية',
  customer_comments: 'ملاحظة عميل',
};

const OP_LABELS: Record<string, string> = {
  upsert: 'حفظ / تعديل',
  delete: 'حذف',
  replace: 'استبدال كامل (جدول)',
  invoice_create: 'رفع فاتورة معلّقة',
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateJsonSize(value: unknown): number {
  try {
    const str = JSON.stringify(value);
    return typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(str).length
      : str.length;
  } catch {
    return 0;
  }
}

function describeOutboxPayload(item: QueuedMutation): { title: string; summary: string } {
  const payload = item.payload as unknown as Record<string, unknown> | undefined;

  if (item.entity === 'products' && item.op === 'replace') {
    return {
      title: 'مزامنة كتالوج الأصناف بالكامل',
      summary: 'استبدال جماعي لبيانات المنتجات عند الرفع — يستهلك Egress أعلى عند تكرار المحاولة',
    };
  }
  if (item.entity === 'targets' && item.op === 'replace') {
    return {
      title: 'مزامنة جدول الأهداف بالكامل',
      summary: 'استبدال جماعي لسجلات التارجت الحالية عند الرفع',
    };
  }
  if (!payload) {
    return {
      title: `${ENTITY_LABELS[item.entity] || item.entity} (${OP_LABELS[item.op] || item.op})`,
      summary: `معرّف السجل: ${item.entityId}`,
    };
  }

  if (item.entity === 'invoices') {
    const inv = payload as unknown as Invoice;
    const invNo = inv.invoiceNumber || item.entityId;
    const cust = inv.customerName || 'عميل غير محدد';
    const total = Number(inv.totalAmount ?? inv.estimatedGrandTotal ?? 0);
    return {
      title: `فاتورة #${invNo} · ${cust}`,
      summary: `${formatCurrency(total)} · المندوب: ${inv.repName || '—'} · الحالة: ${inv.status || '—'}`,
    };
  }

  if (item.entity === 'visits') {
    const visit = payload as unknown as CustomerVisit;
    const cust = visit.customerName || visit.customerCode || item.entityId;
    const col = Number(visit.collectedAmount || 0);
    const colPart = col > 0 ? ` · تحصيل ${formatCurrency(col)}` : '';
    return {
      title: `زيارة: ${cust}`,
      summary: `${visit.type || 'زيارة'} · النتيجة: ${visit.outcome || '—'}${colPart}`,
    };
  }

  if (item.entity === 'customers') {
    const cust = payload as unknown as Customer;
    return {
      title: `عميل: ${cust.name || item.entityId}`,
      summary: `كود: ${cust.code || '—'} · الفرع: ${cust.branchName || '—'}`,
    };
  }

  if (item.entity === 'users') {
    const usr = payload as unknown as User;
    return {
      title: `موظف: ${usr.name || usr.username || item.entityId}`,
      summary: `الدور: ${usr.role || '—'} · الفرع: ${usr.branchName || '—'}`,
    };
  }

  if (item.entity === 'forecasts') {
    const fc = payload as unknown as CollectionForecastRecord;
    return {
      title: `توقع تحصيل: ${fc.customerName || fc.customerId || item.entityId}`,
      summary: `الشهر: ${fc.monthKey || '—'} · التحصيل المتوقع: ${formatCurrency(Number(fc.collectionForecast || 0))} · البيع: ${formatCurrency(Number(fc.salesForecast || 0))}`,
    };
  }

  if (item.entity === 'customer_comments') {
    const cm = payload as unknown as CustomerCommentRecord;
    const text = (cm.body || '').trim();
    const snippet = text.slice(0, 70);
    return {
      title: `ملاحظة عميل (${cm.authorName || 'مستخدم'})`,
      summary: snippet ? `${snippet}${text.length > 70 ? '…' : ''}` : `معرّف: ${item.entityId}`,
    };
  }

  return {
    title: `${ENTITY_LABELS[item.entity] || item.entity}`,
    summary: `العملية: ${OP_LABELS[item.op] || item.op} · ${item.entityId}`,
  };
}

interface PendingSyncViewProps {
  onNavigate?: (tab: string) => void;
}

export const PendingSyncView: React.FC<PendingSyncViewProps> = ({ onNavigate }) => {
  const {
    isOffline,
    pendingInvoicesCount,
    offlineQueueCount,
    deadLetterCount,
    storageQuotaExceeded,
    flushPendingInvoices,
    flushOfflineQueue,
    getPendingInvoicesQueue,
    removePendingInvoices,
    clearPendingInvoicesQueue,
    removeOfflineQueueItems,
    retryOfflineQueueItems,
    clearOfflineQueueItems,
    products,
    targets,
  } = useApp();

  const [outboxItems, setOutboxItems] = useState<QueuedMutation[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    | null
    | { type: 'single'; item: UnifiedPendingItem }
    | { type: 'selected'; count: number }
    | { type: 'dead_letters'; count: number }
    | { type: 'clear_all'; count: number }
  >(null);

  const loadAllQueues = useCallback(async () => {
    setLoading(true);
    try {
      const [queued, invoicesList] = await Promise.all([
        getQueuedMutations().catch(() => [] as QueuedMutation[]),
        getPendingInvoicesQueue().catch(() => [] as Invoice[]),
      ]);
      setOutboxItems(Array.isArray(queued) ? queued : []);
      setPendingInvoices(Array.isArray(invoicesList) ? invoicesList : []);
    } finally {
      setLoading(false);
    }
  }, [getPendingInvoicesQueue]);

  useEffect(() => {
    void loadAllQueues();
  }, [loadAllQueues, pendingInvoicesCount, offlineQueueCount, deadLetterCount]);

  const unifiedItems = useMemo<UnifiedPendingItem[]>(() => {
    const outboxMapped: UnifiedPendingItem[] = outboxItems.map((item) => {
      const { title, summary } = describeOutboxPayload(item);
      let sizeBytes = estimateJsonSize(item);
      if (item.entity === 'products' && item.op === 'replace') {
        sizeBytes = Math.max(sizeBytes, estimateJsonSize(products));
      } else if (item.entity === 'targets' && item.op === 'replace') {
        sizeBytes = Math.max(sizeBytes, estimateJsonSize(targets));
      }
      const dead = isDeadLetter(item);
      const hasError = dead || (item.attempts || 0) > 0 || Boolean(item.lastError);
      return {
        uid: `outbox:${item.id}`,
        rawId: item.id,
        source: 'outbox',
        entity: item.entity,
        op: item.op,
        entityId: item.entityId,
        queuedAt: item.queuedAt || Date.now(),
        attempts: item.attempts || 0,
        isDead: dead,
        hasError,
        lastError: item.lastError,
        sizeBytes,
        heavyEgress: item.op === 'replace' || sizeBytes >= 20 * 1024,
        title,
        summary,
        payloadPreview: item.payload ?? {
          entity: item.entity,
          op: item.op,
          entityId: item.entityId,
          note: 'علامة استبدال جماعي — تستخدم الحالة المحلية الحالية عند المزامنة',
        },
      };
    });

    const invoicesMapped: UnifiedPendingItem[] = pendingInvoices.map((inv) => {
      const queuedAt = inv.createdAt ? Date.parse(inv.createdAt) || Date.now() : Date.now();
      const sizeBytes = estimateJsonSize(inv);
      const itemsCount = Array.isArray(inv.items) ? inv.items.length : 0;
      return {
        uid: `pending_invoice:${inv.id}`,
        rawId: inv.id,
        source: 'pending_invoice',
        entity: 'pending_invoice',
        op: 'invoice_create',
        entityId: inv.invoiceNumber || inv.id,
        queuedAt,
        attempts: 0,
        isDead: false,
        hasError: false,
        sizeBytes,
        heavyEgress: sizeBytes >= 20 * 1024,
        title: `فاتورة أوفلاين #${inv.invoiceNumber || inv.id} · ${inv.customerName || 'عميل غير محدد'}`,
        summary: `${formatCurrency(Number(inv.totalAmount ?? inv.estimatedGrandTotal ?? 0))} · ${itemsCount} صنف · المندوب: ${inv.repName || '—'}`,
        payloadPreview: inv,
      };
    });

    return [...invoicesMapped, ...outboxMapped].sort((a, b) => b.queuedAt - a.queuedAt);
  }, [outboxItems, pendingInvoices, products, targets]);

  const stats = useMemo(() => {
    const totalCount = unifiedItems.length;
    const invoicesCount = pendingInvoices.length;
    const failedCount = unifiedItems.filter((i) => i.hasError).length;
    const deadCount = unifiedItems.filter((i) => i.isDead).length;
    const totalBytes = unifiedItems.reduce((acc, item) => acc + item.sizeBytes, 0);
    return { totalCount, invoicesCount, failedCount, deadCount, totalBytes };
  }, [unifiedItems, pendingInvoices.length]);

  const availableEntities = useMemo(() => {
    const set = new Set<string>();
    unifiedItems.forEach((item) => set.add(item.entity));
    return Array.from(set);
  }, [unifiedItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedItems.filter((item) => {
      if (filterMode === 'outbox' && item.source !== 'outbox') return false;
      if (filterMode === 'invoices' && item.source !== 'pending_invoice') return false;
      if (filterMode === 'failed' && !item.hasError) return false;
      if (entityFilter !== 'all' && item.entity !== entityFilter) return false;
      if (q) {
        const hay = `${item.title} ${item.summary} ${item.entityId} ${item.lastError || ''} ${ENTITY_LABELS[item.entity] || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unifiedItems, filterMode, entityFilter, searchQuery]);

  // Clear stale selections when items change
  useEffect(() => {
    const valid = new Set(unifiedItems.map((i) => i.uid));
    setSelectedUids((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((uid) => {
        if (valid.has(uid)) next.add(uid);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [unifiedItems]);

  const allVisibleSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedUids.has(item.uid));

  const toggleSelectAllVisible = () => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredItems.forEach((i) => next.delete(i.uid));
      } else {
        filteredItems.forEach((i) => next.add(i.uid));
      }
      return next;
    });
  };

  const toggleSelectOne = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const deleteByItems = async (itemsToDelete: UnifiedPendingItem[]) => {
    if (itemsToDelete.length === 0) return;
    setBusyAction('delete');
    setFeedback(null);
    try {
      const outboxIds = itemsToDelete
        .filter((i) => i.source === 'outbox')
        .map((i) => i.rawId);
      const invoiceIds = itemsToDelete
        .filter((i) => i.source === 'pending_invoice')
        .map((i) => i.rawId);

      if (outboxIds.length > 0) await removeOfflineQueueItems(outboxIds);
      if (invoiceIds.length > 0) await removePendingInvoices(invoiceIds);

      setConfirmAction(null);
      setSelectedUids((prev) => {
        const next = new Set(prev);
        itemsToDelete.forEach((i) => next.delete(i.uid));
        return next;
      });
      await loadAllQueues();
      setFeedback({
        tone: 'ok',
        text: `تم حذف ${itemsToDelete.length.toLocaleString('ar-EG')} عملية من الطابور المحلي بنجاح.`,
      });
    } catch (e: any) {
      setFeedback({
        tone: 'err',
        text: e?.message || 'تعذر حذف العمليات المحددة من الطابور.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearAllQueues = async () => {
    setBusyAction('clear_all');
    setFeedback(null);
    try {
      await Promise.all([clearOfflineQueueItems(), clearPendingInvoicesQueue()]);
      setConfirmAction(null);
      setSelectedUids(new Set());
      await loadAllQueues();
      setFeedback({
        tone: 'ok',
        text: 'تم تفريغ جميع طوابير المزامنة المعلّقة بالكامل.',
      });
    } catch (e: any) {
      setFeedback({
        tone: 'err',
        text: e?.message || 'تعذر تفريغ الطابور.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRetryItems = async (itemsToRetry: UnifiedPendingItem[]) => {
    const outboxIds = itemsToRetry
      .filter((i) => i.source === 'outbox')
      .map((i) => i.rawId);
    if (outboxIds.length === 0) return;
    setBusyAction('retry');
    setFeedback(null);
    try {
      await retryOfflineQueueItems(outboxIds);
      await loadAllQueues();
      setFeedback({
        tone: 'ok',
        text: `تم تصفير عداد المحاولات لـ ${outboxIds.length.toLocaleString('ar-EG')} عملية؛ ستُرفع عند توفر الشبكة.`,
      });
    } catch (e: any) {
      setFeedback({
        tone: 'err',
        text: e?.message || 'تعذر إعادة تفعيل العمليات المحددة.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleFlushNow = async () => {
    if (isOffline || busyAction) return;
    setBusyAction('flush');
    setFeedback(null);
    try {
      const [invRes, outboxRes] = await Promise.all([
        flushPendingInvoices(),
        flushOfflineQueue(),
      ]);
      const syncedTotal = (invRes?.syncedCount || 0) + (outboxRes?.syncedCount || 0);
      await loadAllQueues();
      if (syncedTotal > 0) {
        setFeedback({
          tone: 'ok',
          text: `تم رفع ${syncedTotal.toLocaleString('ar-EG')} عملية معلّقة إلى السيرفر بنجاح.`,
        });
      } else if (invRes?.success && outboxRes?.success) {
        setFeedback({
          tone: 'ok',
          text: 'جميع الطوابير متزامنة ولا توجد عمليات معلّقة قابلة للرفع حالياً.',
        });
      } else {
        setFeedback({
          tone: 'warn',
          text: 'تعذر رفع بعض العمليات — راجع رسائل الخطأ في الجدول أدناه أو احذف العمليات العالقة.',
        });
      }
    } catch (e: any) {
      setFeedback({
        tone: 'err',
        text: e?.message || 'فشل تشغيل المزامنة الآن.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const selectedItems = useMemo(
    () => unifiedItems.filter((item) => selectedUids.has(item.uid)),
    [unifiedItems, selectedUids]
  );

  const selectedRetryableCount = useMemo(
    () => selectedItems.filter((i) => i.source === 'outbox' && i.hasError).length,
    [selectedItems]
  );

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--app-text-muted)]">
            <span>النظام والمزامنة</span>
            <span aria-hidden="true">·</span>
            <span className={isOffline ? 'text-[var(--app-warn-text)]' : 'text-[var(--app-ok-text)]'}>
              {isOffline ? 'غير متصل بالشبكة' : 'متصل بالخادم'}
            </span>
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-black text-[var(--app-text)]">
            مزامنة معلقة
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-[var(--app-text-muted)] max-w-2xl">
            مراجعة العمليات المحفوظة محلياً التي لم تُرفع بعد إلى السيرفر، وفحص أحجامها وأسباب تعثرها مع إمكانية حذف العناصر العالقة أو المكررة للحد من استهلاك الـ Egress.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadAllQueues()}
            disabled={loading || !!busyAction}
            className="ps-btn"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث القائمة</span>
          </button>

          <button
            type="button"
            onClick={() => void handleFlushNow()}
            disabled={isOffline || !!busyAction || stats.totalCount === 0}
            className="ps-btn ps-btn--primary"
          >
            {busyAction === 'flush' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4" />
            )}
            <span>مزامنة الكل الآن</span>
          </button>
        </div>
      </header>

      {/* Summary Strip */}
      <section className="kpi-cards kpi-cards--4">
        <KpiCard
          tone="sales"
          label="إجمالي العمليات المعلّقة"
          value={stats.totalCount.toLocaleString('en-US')}
          meta="بانتظار الرفع من هذا الجهاز"
          icon={<UploadCloud />}
        />
        <KpiCard
          tone="promo"
          label="فواتير أوفلاين"
          value={stats.invoicesCount.toLocaleString('en-US')}
          meta="طابور الفواتير المستقل"
          icon={<FileText />}
        />
        <KpiCard
          tone={stats.failedCount > 0 ? 'debt' : 'collection'}
          label="متوقفة / بها أخطاء"
          value={stats.failedCount.toLocaleString('en-US')}
          meta={`منها ${stats.deadCount.toLocaleString('en-US')} متوقفة نهائياً (≥${MAX_ATTEMPTS} محاولات)`}
          icon={<AlertTriangle />}
        />
        <KpiCard
          tone="due"
          label="الحجم التقديري المعلّق"
          value={<span dir="ltr">{formatBytes(stats.totalBytes)}</span>}
          meta="حذف العالقة يمنع تكرار استهلاك Egress"
          icon={<Database />}
        />
      </section>

      {/* Alerts: Storage Quota or Dead Letter */}
      {storageQuotaExceeded && (
        <div className="rounded-2xl border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] p-3.5 flex items-start gap-2.5 text-xs text-[var(--app-warn-text)]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-black">مساحة التخزين المحلي (IndexedDB) ممتلئة</div>
            <p className="mt-0.5 font-medium">
              حذف العمليات القديمة أو غير الضرورية من الطابور يساعد في تحرير مساحة التخزين واستقرار العمل بدون إنترنت.
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 ${
            feedback.tone === 'ok'
              ? 'border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]'
              : feedback.tone === 'warn'
              ? 'border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]'
              : 'border-[var(--app-risk-line)] bg-[var(--app-risk-tint)] text-[var(--app-risk-text)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.tone === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] font-black underline cursor-pointer shrink-0"
          >
            إخفاء
          </button>
        </div>
      )}

      {/* Confirmation Bar (Inline, replaces window.confirm) */}
      {confirmAction && (
        <div className="rounded-2xl border border-[var(--app-risk-line)] bg-[var(--app-risk-tint)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-[var(--app-risk-text)]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-black">
                {confirmAction.type === 'single'
                  ? `تأكيد حذف العملية من الطابور: ${confirmAction.item.title}`
                  : confirmAction.type === 'selected'
                  ? `تأكيد حذف ${confirmAction.count.toLocaleString('ar-EG')} عملية محددة من الطابور`
                  : confirmAction.type === 'dead_letters'
                  ? `تأكيد حذف ${confirmAction.count.toLocaleString('ar-EG')} عملية متوقفة نهائياً من الطابور`
                  : `تأكيد تفريغ الطابور بالكامل (${confirmAction.count.toLocaleString('ar-EG')} عملية)`}
              </div>
              <p className="mt-0.5 font-medium opacity-90">
                سيتم إزالة هذه العملية من طابور الرفع المحلي فقط ولن تُرسل إلى السيرفر. لا يمكن التراجع بعد الحذف.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              disabled={!!busyAction}
              className="h-9 px-3.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)] text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={!!busyAction}
              onClick={() => {
                if (confirmAction.type === 'single') {
                  void deleteByItems([confirmAction.item]);
                } else if (confirmAction.type === 'selected') {
                  void deleteByItems(selectedItems);
                } else if (confirmAction.type === 'dead_letters') {
                  void deleteByItems(unifiedItems.filter((i) => i.isDead));
                } else {
                  void handleClearAllQueues();
                }
              }}
              className="h-9 px-4 rounded-xl bg-[var(--app-risk)] hover:bg-[var(--app-danger-hover)] text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {busyAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>تأكيد الحذف</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Queue Workspace */}
      <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-3.5 sm:p-4 border-b border-[var(--app-border)] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Segmented Mode Filter */}
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--app-card-secondary)] border border-[var(--app-border)]">
              {(
                [
                  { id: 'all', label: `الكل (${stats.totalCount})` },
                  { id: 'outbox', label: `طابور التعديلات (${outboxItems.length})` },
                  { id: 'invoices', label: `فواتير أوفلاين (${pendingInvoices.length})` },
                  { id: 'failed', label: `فاشلة / متوقفة (${stats.failedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`ps-seg ${filterMode === tab.id ? 'ps-seg--on' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search & Entity Select */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] sm:w-64">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالعميل، رقم الفاتورة، المعرّف، الخطأ..."
                  className="w-full h-9 pr-9 pl-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] text-xs font-bold text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-focus)]"
                />
              </div>

              <select
                aria-label="تصفية نوع العملية"
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] text-xs font-bold text-[var(--app-text)] cursor-pointer"
              >
                <option value="all">كل الأنواع</option>
                {availableEntities.map((ent) => (
                  <option key={ent} value={ent}>
                    {ENTITY_LABELS[ent] || ent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {unifiedItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--app-border)]">
              <div className="flex items-center gap-3 text-xs font-bold text-[var(--app-text-muted)]">
                <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--app-text)]">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="w-4 h-4 rounded border-[var(--app-border)] accent-[var(--app-primary)] cursor-pointer"
                  />
                  <span>تحديد الظاهر ({filteredItems.length.toLocaleString('en-US')})</span>
                </label>
                {selectedItems.length > 0 && (
                  <span className="tabular-nums">
                    · المحدد: {selectedItems.length.toLocaleString('en-US')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedItems.length > 0 && (
                  <>
                    {selectedRetryableCount > 0 && (
                      <button
                        type="button"
                        disabled={!!busyAction}
                        onClick={() => void handleRetryItems(selectedItems)}
                        className="h-8 px-3 rounded-lg border border-[var(--app-primary-border)] bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إعادة تفعيل المحدد ({selectedRetryableCount})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!!busyAction}
                      onClick={() =>
                        setConfirmAction({ type: 'selected', count: selectedItems.length })
                      }
                      className="h-8 px-3 rounded-lg bg-[var(--app-risk)] hover:bg-[var(--app-danger-hover)] text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف المحدد ({selectedItems.length})</span>
                    </button>
                  </>
                )}

                {stats.deadCount > 0 && (
                  <button
                    type="button"
                    disabled={!!busyAction}
                    onClick={() =>
                      setConfirmAction({ type: 'dead_letters', count: stats.deadCount })
                    }
                    className="h-8 px-3 rounded-lg border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف المتوقفة ({stats.deadCount})</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!!busyAction}
                  onClick={() =>
                    setConfirmAction({ type: 'clear_all', count: unifiedItems.length })
                  }
                  className="h-8 px-3 rounded-lg border border-[var(--app-risk-line)] bg-[var(--app-card-secondary)] hover:bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ الكل</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Table / Empty / Loading */}
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-14 rounded-xl bg-[var(--app-card-secondary)] border border-[var(--app-border)]"
              />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-black text-[var(--app-text)]">
                {unifiedItems.length === 0
                  ? 'لا توجد عمليات معلّقة في الطابور'
                  : 'لا توجد عمليات مطابقة لخيارات البحث الحالية'}
              </h2>
              <p className="text-xs font-medium text-[var(--app-text-muted)] max-w-md mx-auto">
                {unifiedItems.length === 0
                  ? 'كل التعديلات والفواتير على هذا الجهاز مرفوعة ومتزامنة، ولا توجد محاولات إعادة رفع تستهلك الباقة.'
                  : 'جرّب تغيير نوع الفلتر أو مسح نص البحث لعرض جميع العمليات المعلّقة.'}
              </p>
            </div>
            <div className="pt-1 flex items-center justify-center gap-2">
              {unifiedItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('all');
                    setEntityFilter('all');
                    setSearchQuery('');
                  }}
                  className="h-9 px-4 rounded-xl bg-[var(--app-primary)] text-white text-xs font-black cursor-pointer"
                >
                  إعادة ضبط الفلاتر
                </button>
              ) : (
                onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('home')}
                    className="h-9 px-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] text-[var(--app-text)] text-xs font-black cursor-pointer"
                  >
                    العودة للرئيسية
                  </button>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--app-border)]">
            {filteredItems.map((item) => {
              const isSelected = selectedUids.has(item.uid);
              const isExpanded = expandedUid === item.uid;
              return (
                <div
                  key={item.uid}
                  className={`transition-colors ${
                    isSelected ? 'bg-[var(--app-primary-tint)]/40' : 'hover:bg-[var(--app-card-hover)]/60'
                  }`}
                >
                  <div className="p-3.5 sm:px-4 sm:py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    {/* Right side: Checkbox + Details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(item.uid)}
                        aria-label={`تحديد ${item.title}`}
                        className="mt-1 w-4 h-4 rounded border-[var(--app-border)] accent-[var(--app-primary)] cursor-pointer shrink-0"
                      />

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-black text-[var(--app-text)]">
                            {item.title}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-[var(--app-text-muted)]">
                          {item.summary}
                        </p>

                        {/* Clean unboxed typographic metadata */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-[var(--app-text-muted)]">
                          <span>{ENTITY_LABELS[item.entity] || item.entity}</span>
                          <span aria-hidden="true">·</span>
                          <span>{OP_LABELS[item.op] || item.op}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {new Date(item.queuedAt).toLocaleString('ar-EG')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-mono tabular-nums ${
                              item.heavyEgress ? 'text-[var(--app-warn-text)] font-black' : ''
                            }`}
                            dir="ltr"
                          >
                            {formatBytes(item.sizeBytes)}
                          </span>
                          {item.heavyEgress && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[var(--app-warn-text)]">حجم كبير / تأثير Egress</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span
                            className={`tabular-nums ${
                              item.isDead
                                ? 'text-[var(--app-risk-text)] font-black'
                                : item.hasError
                                ? 'text-[var(--app-warn-text)] font-black'
                                : 'text-[var(--app-primary-text)]'
                            }`}
                          >
                            {item.isDead
                              ? `متوقفة (${item.attempts}/${MAX_ATTEMPTS})`
                              : item.hasError
                              ? `محاولات فاشلة: ${item.attempts}/${MAX_ATTEMPTS}`
                              : 'بانتظار الرفع'}
                          </span>
                        </div>

                        {item.lastError && (
                          <div className="pt-0.5 text-[11px] font-bold text-[var(--app-risk-text)] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>السبب المسجل: {item.lastError}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Left side: Row Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 pr-7 md:pr-0">
                      <button
                        type="button"
                        onClick={() => setExpandedUid(isExpanded ? null : item.uid)}
                        className="h-9 px-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-card-secondary)] hover:bg-[var(--app-card-hover)] text-[var(--app-text)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{isExpanded ? 'إخفاء البيانات' : 'تفاصيل'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {item.source === 'outbox' && item.hasError && (
                        <button
                          type="button"
                          disabled={!!busyAction}
                          onClick={() => void handleRetryItems([item])}
                          className="h-9 px-3 rounded-lg border border-[var(--app-primary-border)] bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>إعادة تفعيل</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={!!busyAction}
                        onClick={() => setConfirmAction({ type: 'single', item })}
                        className="h-9 px-3 rounded-lg border border-[var(--app-risk-line)] bg-[var(--app-risk-tint)] hover:bg-[var(--app-risk)] hover:text-white text-[var(--app-risk-text)] text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف من الطابور</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Payload Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1">
                      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[var(--app-text-muted)]">
                          <span>محتوى العملية المحلي (JSON)</span>
                          <span className="font-mono" dir="ltr">
                            ID: {item.entityId}
                          </span>
                        </div>
                        <pre
                          dir="ltr"
                          className="max-h-60 overflow-auto text-[11px] font-mono text-[var(--app-text)] leading-relaxed whitespace-pre-wrap break-all"
                        >
                          {JSON.stringify(item.payloadPreview, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Guidance Note */}
      <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2.5 text-xs text-[var(--app-text-muted)]">
          {isOffline ? (
            <WifiOff className="w-4 h-4 text-[var(--app-warn-text)] shrink-0 mt-0.5" />
          ) : (
            <Wifi className="w-4 h-4 text-[var(--app-ok-text)] shrink-0 mt-0.5" />
          )}
          <div className="leading-relaxed">
            <span className="font-black text-[var(--app-text)]">متى تستخدم الحذف من الطابور؟ </span>
            إذا لاحظت عملية «استبدال كامل» متكررة، أو سجل قديم فشل أكثر من {MAX_ATTEMPTS} مرات بسبب تعديل صلاحيات أو حذف السجل على السيرفر، فحذفه من هنا يوقف محاولات إعادة الإرسال ويمنع استنزاف الـ Egress.
          </div>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="h-9 px-3.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] text-[var(--app-text)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Database className="w-3.5 h-3.5" />
            <span>الإعدادات</span>
          </button>
        )}
      </section>
    </div>
  );
};

export default PendingSyncView;
