import { Outlet } from 'react-router-dom';
import AuthHeader from './AuthHeader.jsx';

function AuthLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-text">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-primary/10 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-brand-200/20 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8">
        <AuthHeader />
        <main className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <Outlet />
        </main>
        <footer className="border-t border-border py-5 text-center text-xs text-text-muted">
          Secure communication for your team
        </footer>
      </div>
    </div>
  );
}

export default AuthLayout;
