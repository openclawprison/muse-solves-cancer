import Image from 'next/image';
import { cn } from '@/lib/utils';

export function MuseLogo({ className }: { className?: string }) {
  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-[28%] border border-[#c86a8d]/25 bg-[#fffaf3] shadow-[0_8px_24px_rgba(157,53,94,.16)]', className)} aria-hidden="true">
      <Image src="/muse-logo.png" alt="" fill sizes="48px" className="object-cover" />
    </span>
  );
}
