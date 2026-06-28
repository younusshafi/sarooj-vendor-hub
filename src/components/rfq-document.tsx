import type { ReactNode } from "react";

/**
 * Shared presentation chrome for the vendor-facing RFQ document, so the materials
 * (`/bid/$token`) and subcontractor (`/sr-bid/$token`) quotation pages read as one
 * Sarooj RFQ. Charcoal (procurement) theme. Presentation only — each page renders its
 * own line-items table + fields inside these wrappers.
 */

/** Charcoal page wrapper + Sarooj header bar. `subtitle` names the quotation type. */
export function RfqDocShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background" data-theme="charcoal">
      <header className="w-full bg-header text-header-foreground">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6 md:px-10">
          <span className="font-serif text-[20px] leading-none">Sarooj Construction Company</span>
          <span className="text-[13px] opacity-80">{subtitle}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}

/**
 * A document section: a card with a coloured title band. The caller supplies the body
 * (and its own padding), so a section can hold a full-bleed table or a padded field grid.
 */
export function RfqDocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}
