import { useEffect, useState } from 'react';
import { Car } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DriverPageShell } from './DriverPageShell';

export function DriverVehicle() {
  const { profile } = useAuth();
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');

  useEffect(() => {
    setPlate(profile?.vehicle_plate ?? '');
    setModel(profile?.vehicle_model ?? '');
  }, [profile]);

  return (
    <DriverPageShell title="Vehicle">
      <div className="rounded-2xl bg-[#1E2128] p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2ECC71]/20">
            <Car size={22} className="text-[#2ECC71]" />
          </span>
          <div>
            <p className="text-lg font-bold text-white">{model || 'Vehicle model not set'}</p>
            <p className="text-sm text-gray-400">{plate || 'No plate on file'}</p>
          </div>
        </div>
        <p className="text-sm text-gray-400">
          Vehicle details are set during driver onboarding. Contact BuddyRide support to update your vehicle model or plate number.
        </p>
      </div>
    </DriverPageShell>
  );
}
