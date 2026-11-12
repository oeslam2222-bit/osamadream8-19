/**
 * templates/settings/SettingsTemplate.tsx
 * Template #6 — Settings/More.
 *
 * نفس لغة التيمبلت: موبايل شاشة واحدة مرتبة (أقسام كروت/قوائم) +
 * ويب مسافات أكبر. الوضع الليلي بيتحكم فعليًا بـ useTemplateTheme.
 */
import React, { useState } from "react";
import {
  Bell,
  ChevronLeft,
  Database,
  Download,
  HelpCircle,
  Info,
  LogOut,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { useTemplateTheme } from "../theme";

function SwitchRow({
  icon,
  label,
  hint,
  checked,
  onChange,
  tone = "bg-primary",
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{label}</p>
        {hint && <p className="truncate text-[11px] text-text-muted">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? tone : "bg-surface-subtle"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? "start-5" : "start-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsTemplate() {
  const { colorMode, toggleTheme, setTheme } = useTemplateTheme();
  const [switches, setSwitches] = useState<Record<string, boolean>>({
    notifications: true,
    autoSync: true,
    weeklyReport: false,
    biometric: false,
  });
  const [exportState, setExportState] = useState<"idle" | "running">("idle");

  const set = (k: string, v: boolean) => setSwitches((p) => ({ ...p, [k]: v }));

  const runExport = () => {
    setExportState("running");
    window.setTimeout(() => setExportState("idle"), 1400);
  };

  const groups: { title: string; icon: React.ReactNode; rows: { key: string; icon: React.ReactNode; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }[] }[] = [
    {
      title: "إعدادات النظام",
      icon: <SettingsIcon className="h-4 w-4" />,
      rows: [
        {
          key: "theme",
          icon: colorMode === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />,
          label: "الوضع الليلي",
          hint: colorMode === "dark" ? "الوضع الدايم كحلي" : "الوضع الفاتح",
          checked: colorMode === "dark",
          onChange: () => toggleTheme(),
        },
        { key: "autoSync", icon: <RefreshCw className="h-4 w-4" />, label: "المزامنة التلقائية", hint: "كل 30 دقيقة", checked: switches.autoSync, onChange: (v) => set("autoSync", v) },
        { key: "weeklyReport", icon: <Download className="h-4 w-4" />, label: "التقرير الأسبوعي التلقائي", hint: "يصدر كل إثنين", checked: switches.weeklyReport, onChange: (v) => set("weeklyReport", v) },
      ],
    },
    {
      title: "الإشعارات",
      icon: <Bell className="h-4 w-4" />,
      rows: [
        { key: "notifications", icon: <Bell className="h-4 w-4" />, label: "تنبيهات المبيعات والتحصيلات", hint: "عبر البريد والواتساب", checked: switches.notifications, onChange: (v) => set("notifications", v) },
        { key: "biometric", icon: <ShieldCheck className="h-4 w-4" />, label: "المصادقة البيومترية", hint: "حماية الوصول للتطبيق", checked: switches.biometric, onChange: (v) => set("biometric", v) },
      ],
    },
    {
      title: "البيانات",
      icon: <Database className="h-4 w-4" />,
      rows: [
        { key: "export", icon: <Download className="h-4 w-4" />, label: "تصدير نسخة احتياطية", hint: exportState === "running" ? "جاري التصدير…" : "JSON / Excel", checked: true, onChange: () => runExport() },
        { key: "reset", icon: <Trash2 className="h-4 w-4" />, label: "إعادة تعيين البيانات التجريبية", hint: "يرجع لوضع الموك داتا", checked: false, onChange: () => {} },
      ],
    },
  ];

  return (
    <div dir="rtl" className="pb-24 lg:pb-4">
      {/* البروفايل */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-bold text-white">أ.م</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-text">أحمد محمد</p>
            <p className="truncate text-xs text-text-secondary">مدير النظام · طنطا</p>
          </div>
          <span className="rounded-full bg-secondary/10 px-2.5 py-1 text-[10px] font-bold text-secondary">مدير</span>
        </div>
      </div>

      {/* المجموعات */}
      {groups.map((g) => (
        <div key={g.title} className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-surface-subtle/60 px-4 py-2.5">
            <span className="text-text-muted">{g.icon}</span>
            <h2 className="text-xs font-bold text-text-secondary">{g.title}</h2>
          </div>
          {g.rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{r.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{r.label}</p>
                {r.hint && <p className="truncate text-[11px] text-text-muted">{r.hint}</p>}
              </div>
              {r.key === "theme" ? (
                <button
                  role="switch"
                  aria-checked={r.checked}
                  onClick={() => r.onChange(!r.checked)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${r.checked ? "bg-primary" : "bg-surface-subtle"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${r.checked ? "start-5" : "start-0.5"}`} />
                </button>
              ) : r.key === "export" ? (
                <button
                  onClick={() => runExport()}
                  disabled={exportState === "running"}
                  className="shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
                >
                  {exportState === "running" ? "جاري التصدير…" : "تصدير"}
                </button>
              ) : (
                <button
                  role="switch"
                  aria-checked={r.checked}
                  onClick={() => r.onChange(!r.checked)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${r.checked ? "bg-primary" : "bg-surface-subtle"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${r.checked ? "start-5" : "start-0.5"}`} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* أعمال */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <button className="flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-start transition-colors hover:bg-surface-subtle/60">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error/10 text-error"><LogOut className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1 text-start">
            <p className="text-sm font-semibold text-error">تسجيل الخروج</p>
            <p className="text-[11px] text-text-muted">من هذا الجهاز</p>
          </div>
          <ChevronLeft className="h-4 w-4 text-text-muted" />
        </button>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><HelpCircle className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">مركز المساعدة</p>
            <p className="text-[11px] text-text-muted">الدليل، الأسئلة الشائعة</p>
          </div>
          <ChevronLeft className="h-4 w-4 text-text-muted" />
        </div>
      </div>

      {/* عن */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold text-text">Dream Tantawy</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
              النسخة 2.4.0 · منظومة المبيعات والتوزيع
              <br />
              طوّرت بواسطة طنطاوي جروب — TANTAWY GROUP
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsTemplate;
