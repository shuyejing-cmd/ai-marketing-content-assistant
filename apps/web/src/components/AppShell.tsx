export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      {children}
    </main>
  );
}
