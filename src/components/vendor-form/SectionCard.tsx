import type { ReactNode } from "react";

interface SectionCardProps {
  number: number;
  title: string;
  children: ReactNode;
}

export function SectionCard({ number, title, children }: SectionCardProps) {
  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-6 md:p-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">
          {number}
        </span>
        <h2 className="font-serif text-[20px] leading-none text-foreground">
          {title}
        </h2>
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}
