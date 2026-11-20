import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface LiveClockProps {
  className?: string;
}

export const LiveClock = React.memo(({ className }: LiveClockProps) => {
  const [timeString, setTimeString] = useState('');
  const [dateParts, setDateParts] = useState({ day: '', date: '', month: '' });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const now = new Date();
    setTimeString(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    setDateParts({
      day: now.toLocaleDateString('ar-EG', { weekday: 'long' }),
      date: String(now.getDate()),
      month: now.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
    });

    intervalRef.current = setInterval(() => {
      const n = new Date();
      setTimeString(n.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className={`shrink-0 rounded-2xl border border-slate-200 dark:border-[#26364D] bg-slate-50 dark:bg-[#17243A] px-3.5 py-2.5 ${className ?? ''}`}>
      <div className="text-[10px] font-bold text-slate-500 dark:text-[#94A3B8]">التوقيت والتاريخ</div>
      <div className="flex items-center gap-1.5 text-base sm:text-lg font-black font-mono tracking-tight text-[var(--app-text)] dark:text-white">
        <Clock className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
        <span>{timeString}</span>
      </div>
      <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold">
        {dateParts.day}، {dateParts.date} {dateParts.month}
      </div>
    </div>
  );
});

LiveClock.displayName = 'LiveClock';
