export function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <main className="ml-60 min-h-screen bg-[#080c14] p-6">
      {children}
    </main>
  )
}
