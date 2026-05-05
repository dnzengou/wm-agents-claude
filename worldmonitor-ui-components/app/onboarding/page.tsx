import type { Metadata } from 'next';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export const metadata: Metadata = {
  title: 'Welcome to WorldMonitor',
  description: 'Set up your personalized real-time intelligence dashboard in 60 seconds.',
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
