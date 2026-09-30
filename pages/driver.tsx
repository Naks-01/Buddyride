import { useState, useEffect } from "react";

export default function DriverPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("buddy-theme");
    if (saved === "dark") setIsDark(true);
  }, []);

  const toggleTheme = () => {
    const n =!isDark;
    setIsDark(n);
    localStorage.setItem("buddy-theme", n? "dark" : "light");
  };

  return (
    <div className={`min-h-screen flex flex-col ${isDark? "bg-[#0f172a] text-white" : "bg-[#f6f7f8] text-black"}`}>
      {/* TOP BAR */}
      <div className={`flex justify-between items-center px-4 py-3 z-10 ${isDark? "bg-[#1e293b]" : "bg-white shadow-sm"}`}>
        <button onClick={() => setMenuOpen(true)} className="p-2">
          <div className="space-y-1">
            <div className="w-6 h-0.5 bg-orange-500"></div>
            <div className={`w-6 h-0.5 ${isDark? "bg-white" : "bg-black"}`}></div>
            <div className={`w-6 h-0.5 ${isDark? "bg-white" : "bg-black"}`}></div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${isDark? "bg-white/10" : "bg-orange-100 text-orange-600"}`}>R0.00</div>
          <button onClick={toggleTheme} className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark? "bg-white/10" : "bg-black/5"}`}>
            {isDark? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      {/* MAP AREA - LITE */}
      <div className={`flex-1 flex items-center justify-center ${isDark? "bg-[#0f172a]" : "bg-[#eef2f7]"}`}>
        <div className="text-center p-6">
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-2xl ${isDark? "bg-white/10" : "bg-white shadow"}`}>🗺️</div>
          <p className="mt-3 text-sm opacity-60">Polokwane • City of Stars</p>
          <p className="text-xs mt-1 opacity-40">{isOnline? "Searching for riders..." : "You are offline"}</p>
        </div>
      </div>

      {/* BOTTOM BUTTON */}
      <div className={`p-4 ${isDark? "bg-[#1e293b] border-t border-white/10" : "bg-white"}`}>
        <button onClick={() => setIsOnline(!isOnline)} className={`w-full py-4 rounded-2xl font-bold ${isOnline? "bg-white text-black border" : "bg-[#ff7a1a] text-white"}`}>
          {isOnline? "GO OFFLINE" : "GO ONLINE"}
        </button>
      </div>

      {/* BURGER SLIDE MENU */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} className="fixed inset-0 bg-black/40 z-20"></div>
          <div className={`fixed left-0 top-0 bottom-0 w-[280px] z-30 flex flex-col rounded-r-[24px] shadow-2xl ${isDark? "bg-[#1e293b] text-white" : "bg-white text-black"}`}>
            <div className={`p-6 border-b ${isDark? "border-white/10" : "border-black/5"}`}>
              <div className="flex justify-between items-center">
                <div className="flex gap-3 items-center">
                  <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">👤</div>
                  <div>
                    <p className="font-bold text-sm">Driver</p>
                    <p className="text-xs opacity-60">{isOnline? "Online" : "Offline"} • Lite</p>
                  </div>
                </div>
                <button onClick={() => setMenuOpen(false)} className={`w-8 h-8 rounded-full ${isDark? "bg-white/10" : "bg-black/5"}`}>✕</button>
              </div>
              <button onClick={toggleTheme} className={`mt-5 w-full flex justify-between items-center p-3 rounded-xl ${isDark? "bg-[#0f172a]" : "bg-gray-50"}`}>
                <span className="text-sm">{isDark? "🌙 Night Mode" : "☀️ Day Mode"}</span>
                <span className={`w-10 h-5 rounded-full p-1 flex ${isDark? "bg-green-500 justify-end" : "bg-gray-300 justify-start"}`}>
                  <span className="w-3 h-3 bg-white rounded-full block"></span>
                </span>
              </button>
            </div>
            <div className="flex-1 py-2">
              <div className="px-6 py-3 flex gap-3 text-sm bg-orange-500 text-white">🏠 Home</div>
              <div className="px-6 py-3 flex gap-3 text-sm opacity-70">📊 Earnings</div>
              <div className="px-6 py-3 flex gap-3 text-sm opacity-70">📋 Trips</div>
              <div className="px-6 py-3 flex gap-3 text-sm opacity-70">🎧 Support</div>
              <div className="px-6 py-3 flex gap-3 text-sm opacity-70">⚙️ Settings</div>
            </div>
            <div className="p-4 text-[11px] opacity-40">v1.0 • Data Saver On</div>
          </div>
        </>
      )}
    </div>
  );
}