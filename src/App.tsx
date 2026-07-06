import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import AppShell from '@/components/AppShell';
import { useAuth } from '@/providers/AuthProvider';
import ChatHistoryPage from '@/pages/ChatHistoryPage';
import CoachPage from '@/pages/CoachPage';
import FuelPage from '@/pages/FuelPage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import OnboardingPage from '@/pages/OnboardingPage';
import PlanDayPage from '@/pages/PlanDayPage';
import ProgressPage from '@/pages/ProgressPage';
import WorkoutSessionPage from '@/pages/WorkoutSessionPage';

function Splash() {
  return (
    <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
      <div className="flex flex-col items-center gap-4">
        <img src="/forma_logo.png" alt="Forma" className="h-12 w-12 animate-pulse" />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
          Fitness that fits you.
        </span>
      </div>
    </div>
  );
}

/** Wraps the authenticated app: requires session + completed onboarding. */
function RequireAuth({ children }: { children: ReactElement }) {
  const { initialized, isAuthenticated, hasCompletedOnboarding } = useAuth();
  const location = useLocation();

  if (!initialized) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!hasCompletedOnboarding) return <Navigate to="/onboarding" replace />;

  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { initialized, isAuthenticated, hasCompletedOnboarding } = useAuth();

  if (!initialized) return <Splash />;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={hasCompletedOnboarding ? '/' : '/onboarding'} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/onboarding"
        element={
          !isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : hasCompletedOnboarding ? (
            <Navigate to="/" replace />
          ) : (
            <OnboardingPage />
          )
        }
      />

      <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
      <Route path="/coach" element={<RequireAuth><CoachPage /></RequireAuth>} />
      <Route path="/fuel" element={<RequireAuth><FuelPage /></RequireAuth>} />
      <Route path="/progress" element={<RequireAuth><ProgressPage /></RequireAuth>} />
      <Route path="/workout/:day" element={<RequireAuth><WorkoutSessionPage /></RequireAuth>} />
      <Route path="/plan/:day" element={<RequireAuth><PlanDayPage /></RequireAuth>} />
      <Route path="/chat-history" element={<RequireAuth><ChatHistoryPage /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
