type LogoProps = {
  variant?: 'icon' | 'full';
  size?: number;
  className?: string;
};

export function Logo({ variant = 'icon', size = 48, className }: LogoProps) {
  const src = variant === 'full' ? '/buddyride1-logo.png' : '/logos/app-icon.png';
  return <img src={src} alt="BuddyRide1" height={size} style={{ height: size, width: 'auto' }} className={className} />;
}
