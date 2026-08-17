import { useAuth } from '../context/AuthContext';
import type { Lang } from '../lib/i18n';

export function LangSelector() {
  const { lang, setLang } = useAuth();
  return (
    <div className="lang-selector">
      <button
        className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en' as Lang)}
      >
        EN
      </button>
      <button
        className={`lang-btn ${lang === 'nso' ? 'active' : ''}`}
        onClick={() => setLang('nso' as Lang)}
      >
        Sepedi
      </button>
    </div>
  );
}
