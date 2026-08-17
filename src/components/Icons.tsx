import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

const wrap = (children: ReactNode, size: number, className?: string) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const CarIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18.4 8.5c-.3-.9-1.1-1.5-2-1.5h-8.8c-.9 0-1.7.6-2 1.5L4.5 11.1C3.7 11.3 3 12.1 3 13v3c0 .6.4 1 1 1h2" /><circle cx="7.5" cy="17.5" r="2.5" /><path d="M9.5 17h5" /><circle cx="16.5" cy="17.5" r="2.5" /></>, size, className);

export const UserIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, size, className);

export const ShieldIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>, size, className);

export const MapPinIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>, size, className);

export const NavigationIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><polygon points="3 11 22 2 13 21 11 13 3 11" /></>, size, className);

export const SearchIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>, size, className);

export const HistoryIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>, size, className);

export const CashIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>, size, className);

export const CardIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>, size, className);

export const CheckIcon = ({ size = 24, className }: IconProps) =>
  wrap(<polyline points="20 6 9 17 4 12" />, size, className);

export const XIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, size, className);

export const ClockIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>, size, className);

export const PhoneIcon = ({ size = 24, className }: IconProps) =>
  wrap(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />, size, className);

export const SettingsIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, size, className);

export const DollarIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>, size, className);

export const TrendingIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>, size, className);

export const FileIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>, size, className);

export const HomeIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>, size, className);

export const PowerIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></>, size, className);

export const BellIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>, size, className);

export const AlertIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, size, className);

export const LogOutIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>, size, className);

export const GlobeIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>, size, className);

export const UploadIcon = ({ size = 24, className }: IconProps) =>
  wrap(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>, size, className);
