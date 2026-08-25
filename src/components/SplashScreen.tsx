import { useEffect, useState } from 'react';

const SPLASH_SESSION_KEY = 'splashShown';
const VISIBLE_DURATION_MS = 2500;
const FADE_OUT_MS = 500;

export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SPLASH_SESSION_KEY)) return;
    sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
    setVisible(true);

    const hideTimer = setTimeout(() => setHiding(true), VISIBLE_DURATION_MS);
    const removeTimer = setTimeout(() => setVisible(false), VISIBLE_DURATION_MS + FADE_OUT_MS);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`splash-screen${hiding ? ' splash-screen--hidden' : ''}`}>
      <img src="/logos/app-icon.png" alt="BuddyRide" className="splash-logo" />
      <h1 className="splash-title">BuddyRide</h1>
      <p className="splash-tagline">Your Community Connection</p>
      <div className="splash-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
