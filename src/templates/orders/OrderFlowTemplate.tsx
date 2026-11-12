/**
 * templates/orders/OrderFlowTemplate.tsx
 * Template #3 — New Order Flow (catalog → cart/review → confirm → success).
 *
 * Mobile  : full-screen steps + sticky cart bar above the bottom nav
 *           (native ordering-app feel).
 * Desktop : two-pane — catalog beside a sticky live cart. Confirm inline.
 *
 * Same tokens/identity as templates #1 and #2.
 */
import React, { useMemo, useState } from "react";
import {
  BadgePercent,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
} from "lucide-react";
import {
  cartTotals,
  formatEGP,
  lineTotal,
  mockProducts,
  paymentTermsOptions,
  productCategories,
  type CartLine,
  type MockProduct,
} from "./data";

/* ------------------------------------------------------------------ */
/* building blocks                                                     */
/* ------------------------------------------------------------------ */

function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  small = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  small?: boolean;
}) {
  const btn = small
    ? "h-7 w-7 rounded-md"
    : "h-9 w-9 rounded-lg";
  return (
    <div className={`flex items-center gap-1 ${small ? "gap-1" : "gap-1.5"}`} dir="ltr">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={`${btn} flex items-center justify-center border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text disabled:opacity-40`}
        aria-label="نقص"
      >
        <Minus className={small ? "h-3 w-3" : "h-4 w-4"} />
      </button>
      <span
        className={`min-w-[2.5rem] text-center font-bold tabular-nums text-text ${small ? "text-xs" : "text-sm"}`}
      >
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={`${btn} flex items-center justify-center bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-40`}
        aria-label="زود"
      >
        <Plus className={small ? "h-3 w-3" : "h-4 w-4"} />
      </button>
    </div>
  );
}

function ProductCard({
  product,
  cartons,
  onAdd,
  onRemove,
}: {
  product: MockProduct;
  cartons: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const hasPromo = product.promoPrice != null && product.promoPrice < product.cartonPrice;
  const lowStock = product.branchStockReserved < 100;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15">
        <Package className="h-6 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-bold text-text">{product.name}</p>
          {hasPromo && (
            <span className="flex items-center gap-0.5 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
              <BadgePercent className="h-3 w-3" />
              عرض
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-text-muted">
          {product.size} · {product.color} · كرتونة {product.cartonQuantity} قطعة
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          <span className="font-bold tabular-nums text-text">
            {hasPromo ? (
              <>
                <span className="text-warning">{formatEGP(product.promoPrice)}</span>
                <span className="mr-1 text-text-muted line-through">{formatEGP(product.cartonPrice)}</span>
              </>
            ) : (
              formatEGP(product.cartonPrice)
            )}
            <span className="mr-1 font-normal text-text-muted">/كرتونة</span>
          </span>
          <span className="text-text-muted tabular-nums">
            {formatEGP(product.piecePrice)}/قطعة
          </span>
          <span className={`tabular-nums ${lowStock ? "font-semibold text-warning" : "text-text-muted"}`}>
            متاح {product.branchStockReserved} كرتونة
          </span>
        </div>
      </div>

      {cartons > 0 ? (
        <div className="shrink-0">
          <Stepper value={cartons} onChange={(v) => (v === 0 ? onRemove() : onAdd())} />
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          أضف
        </button>
      )}
    </div>
  );
}

function CartLineRow({
  product,
  line,
  onUpdate,
  onRemove,
}: {
  product: MockProduct;
  line: CartLine;
  onUpdate: (line: CartLine) => void;
  onRemove: () => void;
}) {
  const maxCartons = product.branchStockReserved;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text">{product.name}</p>
          <p className="text-[11px] text-text-muted">
            {product.code} · كرتونة {product.cartonQuantity} قطعة
          </p>
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
          aria-label={`حذف ${product.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-16 text-[11px] font-semibold text-text-secondary">كراتين</span>
            <Stepper
              small
              value={line.cartons}
              min={0}
              max={maxCartons}
              onChange={(v) => onUpdate({ ...line, cartons: v })}
            />
            <span className="text-[10px] text-text-muted">/ {maxCartons} متاح</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[11px] font-semibold text-text-secondary">قطع</span>
            <Stepper
              small
              value={line.pieces}
              min={0}
              max={product.cartonQuantity - 1}
              onChange={(v) => onUpdate({ ...line, pieces: v })}
            />
            <span className="text-[10px] text-text-muted">/ {product.cartonQuantity - 1}</span>
          </div>
        </div>
        <p className="text-sm font-bold tabular-nums text-text">
          {formatEGP(lineTotal(product, line.cartons, line.pieces))}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

type Step = "catalog" | "review" | "done";

export function OrderFlowTemplate() {
  const [step, setStep] = useState<Step>("catalog");
  const [category, setCategory] = useState("الكل");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);

  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<string>(paymentTermsOptions[0]);
  const [notes, setNotes] = useState("");

  const totals = useMemo(() => cartTotals(mockProducts, lines), [lines]);

  const filtered = mockProducts.filter((p) => {
    if (category !== "الكل" && p.category !== category) return false;
    if (!query.trim()) return true;
    return p.name.includes(query.trim()) || p.code.includes(query.trim());
  });

  const productOf = (id: string) => mockProducts.find((p) => p.id === id)!;

  const addProduct = (id: string) => {
    setLines((prev) => {
      const exists = prev.find((l) => l.productId === id);
      if (exists) return prev.map((l) => (l.productId === id ? { ...l, cartons: l.cartons + 1 } : l));
      return [...prev, { productId: id, cartons: 1, pieces: 0 }];
    });
  };

  const removeProduct = (id: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== id));
  };

  const updateLine = (next: CartLine) => {
    setLines((prev) => {
      if (next.cartons === 0 && next.pieces === 0) return prev.filter((l) => l.productId !== next.productId);
      return prev.map((l) => (l.productId === next.productId ? next : l));
    });
  };

  const orderNo = `ORD-${2454 + totals.count}`;

  /* ---------------- success ---------------- */
  if (step === "done") {
    return (
      <div dir="rtl" className="flex flex-col items-center justify-center gap-5 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-text">تم إنشاء الطلبية ✅</h2>
          <p className="mt-1 text-sm text-text-secondary">
            رقم الطلبية <span className="font-bold text-text">{orderNo}</span> — بانتظار موافقة الفرع
          </p>
        </div>
        <div className="w-full max-w-md space-y-2 rounded-2xl border border-border bg-card p-4 text-right shadow-sm">
          {lines.map((l) => {
            const p = productOf(l.productId);
            return (
              <div key={l.productId} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-text-secondary">
                  {p.name} <span className="tabular-nums text-text-muted">× {l.cartons} كرتونة{l.pieces ? ` + ${l.pieces} قطعة` : ""}</span>
                </span>
                <span className="font-bold tabular-nums text-text">{formatEGP(lineTotal(p, l.cartons, l.pieces))}</span>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-sm">
            <span className="font-bold text-text">الإجمالي</span>
            <span className="font-extrabold tabular-nums text-primary">{formatEGP(totals.subtotal)}</span>
          </div>
        </div>
        <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
          <button
            onClick={() => {
              setLines([]);
              setStep("catalog");
              setDeliveryDate("");
              setNotes("");
            }}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            طلبية جديدة
          </button>
          <button
            onClick={() => {
              setLines([]);
              setStep("catalog");
            }}
            className="flex-1 rounded-xl border border-border bg-card py-3 text-sm font-bold text-text-secondary transition-colors hover:text-text"
          >
            رجوع للأصناف
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- layout ---------------- */
  const catalog = (
    <div>
      {/* category chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {productCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              category === c
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-surface text-text-secondary hover:border-primary/30 hover:text-text"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="relative mt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو الكود…"
          className="w-full rounded-xl border border-border bg-card py-2.5 px-4 text-sm text-text shadow-sm placeholder:text-text-muted focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* products */}
      <div className="mt-4 space-y-2.5">
        {filtered.map((p) => {
          const line = lines.find((l) => l.productId === p.id);
          return (
            <ProductCard
              key={p.id}
              product={p}
              cartons={line?.cartons ?? 0}
              onAdd={() => addProduct(p.id)}
              onRemove={() => removeProduct(p.id)}
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 text-center">
            <Package className="h-8 w-8 text-text-muted" />
            <p className="text-sm text-text-secondary">مفيش أصناف مطابقة</p>
          </div>
        )}
      </div>
    </div>
  );

  const cartPanel = (
    <div className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <ShoppingCart className="h-4 w-4 text-primary" />
          السلة
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
            {totals.count} صنف
          </span>
        </h3>
        {totals.count > 0 && (
          <button
            onClick={() => setLines([])}
            className="text-[11px] font-semibold text-text-muted transition-colors hover:text-error"
          >
            تفريغ السلة
          </button>
        )}
      </div>

      <div className="max-h-[45dvh] space-y-2.5 overflow-y-auto p-3 lg:max-h-none lg:flex-1 lg:overflow-visible">
        {totals.count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Store className="h-7 w-7 text-text-muted" />
            <p className="text-xs text-text-secondary">السلة فاضية — ضيف أصناف من الكتالوج</p>
          </div>
        ) : (
          lines.map((l) => (
            <CartLineRow
              key={l.productId}
              product={productOf(l.productId)}
              line={l}
              onUpdate={updateLine}
              onRemove={() => removeProduct(l.productId)}
            />
          ))
        )}
      </div>

      {totals.count > 0 && (
        <div className="space-y-1.5 border-t border-border p-4 text-xs">
          {totals.savings > 0 && (
            <div className="flex items-center justify-between text-warning">
              <span className="flex items-center gap-1 font-semibold">
                <BadgePercent className="h-3.5 w-3.5" />
                وفر العروض
              </span>
              <span className="font-bold tabular-nums">− {formatEGP(totals.savings)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-text-secondary">
            <span>عدد الكراتين</span>
            <span className="font-bold tabular-nums text-text">{totals.totalCartons}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-sm">
            <span className="font-bold text-text">الإجمالي</span>
            <span className="font-extrabold tabular-nums text-primary">{formatEGP(totals.subtotal)}</span>
          </div>
          <button
            onClick={() => setStep("review")}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <ClipboardCheck className="h-4 w-4" />
            مراجعة وتأكيد الطلبية
          </button>
        </div>
      )}
    </div>
  );

  const review = (
    <div dir="rtl" className="pb-24 lg:pb-4">
      <button
        onClick={() => setStep("catalog")}
        className="mb-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text"
      >
        رجوع للسلة
      </button>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
          <Truck className="h-4 w-4 text-primary" />
          تفاصيل التسليم
        </h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-text-secondary">تاريخ التسليم المطلوب</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-text-secondary">طريقة الدفع</label>
            <div className="flex flex-wrap gap-2">
              {paymentTermsOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => setPaymentTerms(t)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    paymentTerms === t
                      ? "bg-primary text-white shadow-sm"
                      : "border border-border bg-surface text-text-secondary hover:text-text"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-text-secondary">ملاحظات (اختياري)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="أي تفاصيل إضافية للفرع…"
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
          <ShoppingCart className="h-4 w-4 text-primary" />
          ملخص الطلبية
        </h3>
        <ul className="divide-y divide-border-subtle">
          {lines.map((l) => {
            const p = productOf(l.productId);
            return (
              <li key={l.productId} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 text-xs">
                <span className="min-w-0 truncate text-text-secondary">
                  {p.name}
                  <span className="text-text-muted"> × {l.cartons} كرتونة{l.pieces ? ` + ${l.pieces} قطعة` : ""}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-text">{formatEGP(lineTotal(p, l.cartons, l.pieces))}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
          {totals.savings > 0 && (
            <div className="flex items-center justify-between text-warning">
              <span className="font-semibold">وفر العروض</span>
              <span className="font-bold tabular-nums">− {formatEGP(totals.savings)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-text">الإجمالي</span>
            <span className="font-extrabold tabular-nums text-primary">{formatEGP(totals.subtotal)}</span>
          </div>
        </div>
      </section>

      <button
        onClick={() => setStep("done")}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:brightness-95 lg:w-auto lg:px-8"
      >
        <Check className="h-4 w-4" />
        تأكيد وإرسال الطلبية
      </button>
    </div>
  );

  return (
    <div dir="rtl">
      {step === "review" ? (
        review
      ) : (
        <div className="lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
          {/* catalog */}
          <div className="lg:col-span-3">
            <div className="mb-5 pb-24 lg:pb-0">
              <p className="text-xs text-text-muted">طلبيات جديدة</p>
              <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight text-text sm:text-2xl">
                <ShoppingCart className="h-6 w-6 text-primary" />
                طلبية جديدة
              </h1>
              {catalog}
            </div>

            {/* sticky cart bar (mobile) */}
            {totals.count > 0 && (
              <div className="fixed inset-x-0 bottom-[64px] z-30 mx-auto max-w-md px-4 lg:hidden">
                <button
                  onClick={() => setStep("review")}
                  className="flex w-full items-center justify-between rounded-2xl bg-primary px-4 py-3 text-white shadow-lg"
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[11px] font-black tabular-nums">
                      {totals.count}
                    </span>
                    عرض السلة
                  </span>
                  <span className="text-sm font-extrabold tabular-nums">{formatEGP(totals.subtotal)}</span>
                </button>
              </div>
            )}
          </div>

          {/* cart (desktop) */}
          <div className="hidden lg:col-span-2 lg:sticky lg:top-20 lg:block">{cartPanel}</div>
        </div>
      )}
    </div>
  );
}

export default OrderFlowTemplate;
