import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type DriverPageShellProps = { title: string; children: ReactNode };

export function DriverPageShell({ title, children }: DriverPageShellProps) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="rounded-full p-1 text-gray-300 hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
    </div>
  );
}
