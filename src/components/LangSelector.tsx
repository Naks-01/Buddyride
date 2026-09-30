import { useAuth } from '../context/AuthContext';

export function LangSelector() {
  const { lang, setLang } = useAuth();
  return (
    <div className="lang-selector">
      <button
        className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en' as any)}
      >
        EN
      </button>
      <button
        className={`lang-btn ${(lang as any) === 'nso' ? 'active' : ''}`}
        onClick={() => setLang('nso' as any)}
      >
        Sepedi
      </button>
    </div>
  );
}

