import { useAuth } from '../../context/AuthContext';
import { IdVerificationForm, VerificationStatusCard } from '../../components/IdVerificationForm';
import { DriverPageShell } from './DriverPageShell';

export function DriverDocuments() {
  const { profile, refreshProfile } = useAuth();
  const status = profile?.verificationStatus ?? 'unverified';

  return (
    <DriverPageShell title="Documents">
      <VerificationStatusCard status={status} />
      {status !== 'verified' && (
        <div className="rounded-2xl bg-white p-5">
          <IdVerificationForm initialStatus={status} onVerified={() => void refreshProfile()} />
        </div>
      )}
      {status === 'verified' && <p className="text-sm text-gray-400">Your ID and license documents are verified. No action needed.</p>}
    </DriverPageShell>
  );
}
