import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Box, Filter, Moon, Search, Sun, Truck } from 'lucide-react';
import './index.css';
import './styles/theme-tokens.css';
import './styles/brand-v2.css';
import './styles/theme-consistency.css';
import './styles/design-preview.css';

type Mode = 'light' | 'dark';

const readInitialMode = (): Mode => {
  const param = new URLSearchParams(window.location.search).get('mode');
  if (param === 'dark' || param === 'light') return param;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const KPIS = [
  { label: 'إجمالي المبيعات', value: '1,284,500 ج.م', meta: 'نمو +12.4% عن الشهر السابق', tone: 'blue' as const },
  { label: 'عدد القطع', value: '48,320', meta: 'أعلى قطاع: منزلي', tone: 'teal' as const },
  { label: 'أصناف بدون حركة', value: '126', meta: 'تحتاج خطة تنشيط', tone: 'amber' as const },
  { label: 'نسبة تحقيق العروض', value: '73.8%', meta: 'فرق: الفيوم، منوف', tone: 'violet' as const }
];

const ROWS = [
  { code: '1002437', unified: '245118', item: 'قروان استيل هندى 50 سم', family: 'قروان', color: 'استيل', sector: 'منزلي', qty: '124', total: '22,320' },
  { code: '1001286', unified: '245119', item: 'كنك 3 ق ليزر استيل', family: 'كنك قهوة', color: 'أحمر', sector: 'منزلي', qty: '96', total: '11,520' },
  { code: '1003511', unified: '245204', item: 'طقم صواني تقديم 3 قطع', family: 'صواني', color: 'ذهبي', sector: 'هدايا', qty: '58', total: '8,700' },
  { code: '1009074', unified: '245330', item: 'ترمس حرارى 1 لتر', family: 'ترمس', color: 'أسود', sector: 'منزلي', qty: '210', total: '31,500' }
];

export const DesignPreview: React.FC = () => {
  const [mode, setMode] = useState<Mode>(readInitialMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  return (
    <div className="dp-wrap">
      {/* ---------- رأس الصفحة ---------- */}
      <header className="dp-head">
        <div>
          <span className="dp-head__crumb">الرئيسية / التحليلات / مبيعات الأصناف</span>
          <h1>تحليل مبيعات الأصناف</h1>
          <p>
            نموذج موحّد للشكل: كروت ملوّنة بحدود واضحة، خطوط عريضة مقروءة، وأزرار بلون واحد للهوية —
            نفس التفاصيل في الوضع النهاري والليلي.
          </p>
        </div>
        <div className="dp-mode" role="group" aria-label="تبديل الوضع">
          <button type="button" data-active={mode === 'light'} onClick={() => setMode('light')}>
            <Sun size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
            نهاري
          </button>
          <button type="button" data-active={mode === 'dark'} onClick={() => setMode('dark')}>
            <Moon size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
            ليلي
          </button>
        </div>
      </header>

      {/* ---------- كروت المؤشرات ---------- */}
      <section className="dp-kpis">
        {KPIS.map((kpi) => (
          <article key={kpi.label} className={`dp-kpi dp-kpi--${kpi.tone}`}>
            <div className="dp-kpi__label">{kpi.label}</div>
            <div className="dp-kpi__value">{kpi.value}</div>
            <div className="dp-kpi__meta">{kpi.meta}</div>
          </article>
        ))}
      </section>

      {/* ---------- الفلاتر ---------- */}
      <section className="dp-card">
        <div className="dp-card__head">
          <div className="dp-card__title">
            <Filter size={14} />
            فلاتر سريعة
          </div>
          <span className="dp-card__hint">الفلاتر بتظهر نشطة بلون أزرق واضح</span>
        </div>
        <div className="dp-filters">
          <label className="dp-field">
            <span>القطاع</span>
            <select className="dp-input" defaultValue="all">
              <option value="all">كل القطاعات</option>
              <option value="home">منزلي</option>
              <option value="gift">هدايا</option>
            </select>
          </label>
          <label className="dp-field">
            <span>الفرع</span>
            <select className="dp-input" defaultValue="all">
              <option value="all">كل الفروع</option>
              <option value="fayoum">الفيوم</option>
              <option value="menouf">منوف</option>
            </select>
          </label>
          <label className="dp-field">
            <span>المندوب</span>
            <select className="dp-input" defaultValue="all">
              <option value="all">كل المناديب</option>
              <option value="r1">أحمد سمير</option>
            </select>
          </label>
          <label className="dp-field">
            <span>بحث بالعميل</span>
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{ position: 'absolute', insetInlineStart: 9, top: 12, color: 'var(--app-text-muted)' }}
              />
              <input className="dp-input" style={{ width: '100%', paddingInlineStart: 28 }} placeholder="كود أو اسم العميل" />
            </div>
          </label>
        </div>
      </section>

      {/* ---------- الأزرار والشارات ---------- */}
      <div className="dp-grid2">
        <section className="dp-card">
          <div className="dp-card__head">
            <div className="dp-card__title">
              <Box size={14} />
              الأزرار
            </div>
            <span className="dp-card__hint">نفس الشكل في كل الشاشات</span>
          </div>
          <div className="dp-buttons">
            <button className="dp-btn dp-btn--primary" type="button">حفظ</button>
            <button className="dp-btn dp-btn--blue" type="button">إضافة صنف</button>
            <button className="dp-btn dp-btn--teal" type="button">تصدير Excel</button>
            <button className="dp-btn dp-btn--amber" type="button">مراجعة</button>
            <button className="dp-btn dp-btn--ghost" type="button">إلغاء</button>
          </div>
          <div className="dp-badges" style={{ marginTop: 12 }}>
            <span className="dp-badge dp-badge--ok">متاح</span>
            <span className="dp-badge dp-badge--info">جديد</span>
            <span className="dp-badge dp-badge--warn">رصيد منخفض</span>
            <span className="dp-badge dp-badge--risk">نافد</span>
            <span className="dp-badge dp-badge--violet">عرض خاص</span>
          </div>
        </section>

        <section className="dp-card">
          <div className="dp-card__head">
            <div className="dp-card__title">
              <BarChart3 size={14} />
              الخطوط
            </div>
            <span className="dp-card__hint">Cairo — أوزان 800 / 700 / 600</span>
          </div>
          <div className="dp-type">
            <div><span className="dp-h1">عنوان الصفحة</span><code>20px · 800</code></div>
            <div><span className="dp-h2">عنوان الكارت</span><code>15px · 800</code></div>
            <div><span className="dp-h3">عنوان القسم الفرعي</span><code>12.5px · 800</code></div>
            <div><span className="dp-body">نص عادي للمحتوى والبيانات الوصفية.</span><code>11.5px · 600</code></div>
            <div><span className="dp-muted">نص ثانوي / تلميح</span><code>10.5px · 700</code></div>
            <div><span className="dp-num" style={{ fontSize: 18 }}>1,284,500</span><code>أرقام tabular</code></div>
          </div>
        </section>
      </div>

      {/* ---------- الجدول ---------- */}
      <section className="dp-card">
        <div className="dp-card__head">
          <div className="dp-card__title">
            <Truck size={14} />
            جدول البيانات
          </div>
          <span className="dp-card__hint">صفوف مخططة + إجمالي واضح</span>
        </div>
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>كود المنتج</th>
                <th>الكود الموحد</th>
                <th>الصنف</th>
                <th>العائلة</th>
                <th>اللون</th>
                <th>القطاع</th>
                <th>عدد القطع</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.code}>
                  <td className="dp-num">{row.code}</td>
                  <td className="dp-num" style={{ color: 'var(--app-primary-text)' }}>#{row.unified}</td>
                  <td>{row.item}</td>
                  <td>{row.family}</td>
                  <td>{row.color}</td>
                  <td>{row.sector}</td>
                  <td className="dp-num">{row.qty}</td>
                  <td className="dp-num" style={{ color: 'var(--app-success-text)' }}>{row.total} ج.م</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dp-note">الوضع الحالي: {mode === 'dark' ? 'ليلي — خلفية كحلي داكن وكروت أفتح بحدود واضحة' : 'نهاري — خلفية رمادية فاتحة وكروت بيضاء بحدود ناعمة'}</p>
      </section>
    </div>
  );
};

const previewRoot = document.getElementById('design-preview-root');
if (previewRoot) {
  createRoot(previewRoot).render(<DesignPreview />);
}

export default DesignPreview;
