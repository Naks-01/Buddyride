"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";

export type Lang = "en" | "st" | "nso";

type Translations = Record<string, Record<string, string>>;

const translations: Translations = {
  en: {
    welcome: "Welcome to BuddyRide",
    login: "Login",
    logout: "Logout",
  },
  st: {
    welcome: "Rea u amohela ho BuddyRide",
    login: "Kena",
    logout: "Tswa",
  },
  nso: {
    welcome: "Re go amogela go BuddyRide",
    login: "Tsena",
    logout: "Tswa",
  },
};

interface LanguageContextType {
  language: Lang;
  setLanguage: (lang: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Lang>("en");

  const t = (key: string): string => {
    return translations[language]?.[key]  translations["en"]?.[key]  key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useTranslation() {
  return useLanguage();
}