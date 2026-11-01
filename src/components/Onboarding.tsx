import React, { useCallback, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShoppingCart,
  Users,
  Package,
  Receipt,
  Store,
  Wand2,
  BarChart3,
  X,
} from 'lucide-react';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'مرحباً بك في منظومة مجموعة الطنطاوي',
    description: 'نظام متكامل لإدارة المبيعات، المخازن، الفواتير، والعملاء. مصمم للمندوبين والمشرفين.',
    icon: <Store className="w-8 h-8" />,
  },
  {
    id: 2,
    title: 'الكتالوج والأصناف',
    description: 'تصفح منتجات الشركة، راجع الأسعار، مخزون الفرع ومخزون أكتوبر، وأضف الأصناف إلى سلة الطلبات.',
    icon: <Package className="w-8 h-8" />,
  },
  {
    id: 3,
    title: 'العملاء والزيارات',
    description: 'إدارة قاعدة العملاء، تسجيل الزيارات الميدانية، ومتابعة المديونيات والحد الائتماني لكل عميل.',
    icon: <Users className="w-8 h-8" />,
  },
  {
    id: 4,
    title: 'الفواتير والتحصيلات',
    description: 'إصدار الفواتير الإلكترونية، تسجيل الدفعات، ومتابعة حالة كل فاتورة من الاعتماد حتى السداد.',
    icon: <Receipt className="w-8 h-8" />,
  },
];

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      try {
        localStorage.setItem('tantawy_onboarding_completed', 'true');
      } catch {}
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [isLastStep, onComplete]);

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const handleSkip = useCallback(() => {
    try {
      localStorage.setItem('tantawy_onboarding_completed', 'true');
    } catch {}
    onComplete();
  }, [onComplete]);

  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8 text-center"
      role="dialog"
      aria-modal="true"
      aria-label="جولة تعريفية بالتطبيق"
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg bg-surface rounded-3xl border border-border-primary shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-surface p-6 sm:p-8 border-b border-border-primary">
          <div className="flex items-center justify-between mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-soft text-blue-600 flex items-center justify-center font-black shadow-lg">
              <Wand2 className="w-6 h-6" />
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-muted font-bold uppercase tracking-wider hover:text-link transition"
              aria-label="تخطي الجولة التعريفية"
            >
              تخطي
            </button>
          </div>

          <h2 className="text-xl font-black text-primary mb-2">{step.title}</h2>
          <p className="text-secondary text-sm leading-relaxed">{step.description}</p>
        </div>

        <div className="p-6 sm:p-10 bg-surface">
          <div className="w-20 h-20 rounded-full bg-surface-alt flex items-center justify-center mx-auto mb-6 shadow-sm border border-border-primary">
            {step.icon}
          </div>
        </div>

        <div className="bg-surface-alt border-t border-border-primary p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2 text-xs font-bold text-muted">
            <span>الخطوة {currentStep + 1} من {ONBOARDING_STEPS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-border-primary/30 h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent text-inverse transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 mt-6 pt-6 border-t border-border-primary">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-30 disabled:pointer-events-none"
              aria-label="الخطوة السابقة"
            >
              {currentStep > 0 && (
                <>
                  <ArrowLeft className="w-4 h-4" />
                  <span>السابق</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-navy text-white font-black shadow-md hover:bg-blue-deep4 transition active:scale-95"
              aria-label={isLastStep ? 'إنهاء الجولة' : 'الخطوة التالية'}
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>إنهاء</span>
                </>
              ) : (
                <>
                  <span>التالي</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;