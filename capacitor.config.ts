import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.buddyride.app',
  appName: 'BuddyRide',
  webDir: 'dist',
  server: {
    url: 'https://www.buddyride.co.za',
    cleartext: true,
    androidScheme: 'https'
  }
};

export default config;