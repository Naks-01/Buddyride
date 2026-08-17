import { useState, useRef, useEffect } from 'react';
import { MapPinIcon, SearchIcon, XIcon } from './Icons';

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface LocationInputProps {
  label: string;
  placeholder: string;
  value: string;
  coords: { lat: number; lng: number } | null;
  onChange: (address: string, coords: { lat: number; lng: number } | null) => void;
  iconColor?: string;
}

export function LocationInput({
  label,
  placeholder,
  value,
  coords,
  onChange,
  iconColor = 'var(--orange)',
}: LocationInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const search = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            text + ', Limpopo, South Africa'
          )}&limit=5&countrycodes=za`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data: SearchResult[] = await res.json();
        setResults(data);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 400);
  };

  const selectResult = (r: SearchResult) => {
    const address = r.display_name.split(',').slice(0, 3).join(', ');
    setQuery(address);
    setShowResults(false);
    setResults([]);
    onChange(address, { lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
  };

  const clearInput = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    onChange('', null);
  };

  return (
    <div className="loc-input-wrapper">
      <label className="form-label">{label}</label>
      <div className="loc-input-row">
        <MapPinIcon size={18} className="loc-input-icon" />
        <span className="loc-input-dot" style={{ background: iconColor }} />
        <input
          className="loc-input-field"
          value={query}
          onChange={(e) => {
            search(e.target.value);
            setShowResults(true);
            if (!e.target.value) onChange('', null);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder={placeholder}
          type="text"
          autoComplete="off"
        />
        {query && (
          <button className="loc-input-clear" onClick={clearInput}>
            <XIcon size={16} />
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="loc-results">
          {results.map((r, i) => (
            <button
              key={i}
              className="loc-result-item"
              onMouseDown={() => selectResult(r)}
            >
              <SearchIcon size={16} className="loc-result-icon" />
              <span className="loc-result-text">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {showResults && loading && results.length === 0 && query.length >= 3 && (
        <div className="loc-results">
          <div className="loc-result-item loc-result-loading">
            <div className="spinner" style={{ width: 16, height: 16 }} />
            <span>Searching...</span>
          </div>
        </div>
      )}

      {coords && !showResults && (
        <div className="loc-coords">
          {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
        </div>
      )}
    </div>
  );
}
