import type { Metadata } from 'next';
import { LoginPage } from '@/components/auth/LoginPage';

export const metadata: Metadata = {
  title: 'Sign In | WorldMonitor Agents',
  description: 'Sign in to access the live multi-domain intelligence dashboard.',
};

export default function LoginRoute() {
  return <LoginPage />;
}
