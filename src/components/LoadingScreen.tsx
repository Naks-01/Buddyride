import { Spinner } from './Spinner';

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <div className="loading-screen">
      <div className="role-logo" style={{ width: 60, height: 60, fontSize: 24, borderRadius: 16 }}>
        BR
      </div>
      <Spinner />
      <p className="text-gray text-sm">{message || 'BuddyRide1'}</p>
    </div>
  );
}
