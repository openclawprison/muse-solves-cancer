import { cn } from '@/lib/utils';

export function MuseLogo({ className }: { className?: string }) {
  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-[28%] bg-primary text-[#101a17] shadow-[0_0_20px_rgba(203,255,86,.16)]', className)} aria-hidden="true">
      <span className="text-[.55em] font-black leading-none tracking-[-.12em]">M</span>
    </span>
  );
}
