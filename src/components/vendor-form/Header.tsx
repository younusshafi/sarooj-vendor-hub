export function Header() {
  return (
    <>
      <header className="w-full bg-header text-header-foreground">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6 md:px-10">
          <span className="font-serif text-[20px] leading-none">Sarooj Construction Company</span>
          <span className="text-[13px]" style={{ color: "var(--sidebar-foreground)" }}>
            Vendor Registration
          </span>
        </div>
      </header>
      <section className="bg-background">
        <div className="mx-auto max-w-[780px] px-6 pb-8 pt-12 md:px-8 md:pt-12">
          <h1 className="font-serif text-[36px] leading-tight text-foreground">
            Vendor Registration
          </h1>
          <p className="mt-3 text-[16px]" style={{ color: "var(--muted-foreground)" }}>
            Register your company to join Sarooj Construction's approved vendor network. Your
            application will be reviewed by our procurement team.
          </p>
          <hr className="mt-8 border-t border-border" />
        </div>
      </section>
    </>
  );
}
