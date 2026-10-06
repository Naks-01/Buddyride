import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IdVerificationForm } from '../components/IdVerificationForm';
import { XIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';

// NETA VERIFICATION - Re-enable after 20 drivers in Polokwane
export function Profile() {
  const navigate = useNavigate();
  const { profile, loading, refreshProfile } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  const handleVerified = async () => {
    await refreshProfile();
    navigate('/passenger', { replace: true });
  };

  return (
    <div className="role-screen">
      <button
        onClick={() => navigate(-1)}
        style={{ position: 'absolute', top: 16, left: 16, background: 'transparent', color: 'var(--gray)', padding: 8 }}
      >
        <XIcon size={24} />
        Back
      </button>

      <h1 className="role-title" style={{ fontSize: 22 }}>
        ID Verification
      </h1>

      <IdVerificationForm
        initialStatus={profile?.verificationStatus ?? 'unverified'}
        onVerified={() => void handleVerified()}
      />
    </div>
  );
}
