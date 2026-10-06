import { PhoneLogin as PhoneLoginView } from '../views/PhoneLogin';
import type { AppRole } from '../types';

interface PhoneLoginProps {
  role: AppRole;
  onBack: () => void;
}

export function PhoneLogin({ role, onBack }: PhoneLoginProps) {
  return <PhoneLoginView role={role} onBack={onBack} />;
}