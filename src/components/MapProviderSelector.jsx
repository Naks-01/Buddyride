import { useState } from 'react';
import { Compass, MapPin, Navigation as NavigationIcon } from 'lucide-react';
import { getMapProvider, setMapProvider } from '../lib/navigation';

const OPTIONS = [
  { id: 'google', label: 'Google Maps', icon: MapPin },
  { id: 'waze', label: 'Waze', icon: NavigationIcon },
  { id: 'inapp', label: 'In-App Map', icon: Compass },
];

// Bolt-style radio list for choosing which app handles turn-by-turn navigation.
export function MapProviderSelector({ theme = 'light' }) {
  const [selected, setSelected] = useState(getMapProvider());
  const isDark = theme === 'dark';

  const choose = (id) => {
    setSelected(id);
    setMapProvider(id);
  };

  return (
    <div className="space-y-2">
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = selected === id;
        return (
          <label
            key={id}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
              isDark
                ? `bg-[#252A33] text-white ${active ? 'border-[#2ECC71]' : 'border-white/10'}`
                : `bg-white text-gray-800 ${active ? 'border-orange-500' : 'border-gray-200'}`
            }`}
          >
            <input
              type="radio"
              name="mapProvider"
              checked={active}
              onChange={() => choose(id)}
              className="h-4 w-4"
            />
            <Icon size={20} />
            <span className="font-semibold">{label}</span>
          </label>
        );
      })}
    </div>
  );
}
