export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] bg-canvas px-4 py-5">
      {children}
    </main>
  );
}
