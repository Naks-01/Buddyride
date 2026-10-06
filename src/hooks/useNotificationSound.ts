import { useCallback } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { playSound, playSoundTimes, type SoundType } from '../utils/sound';

type NotificationSoundName = 'request' | 'assigned' | 'arriving' | 'completed' | 'cancel';

// Maps the Bolt-style event names used by callers to the shared sound engine's asset keys
// (src/utils/sound.ts) so there's a single audio source of truth across driver/passenger screens.
const SOUND_TYPE: Record<NotificationSoundName, SoundType> = {
  request: 'request',
  assigned: 'accepted',
  arriving: 'arrived',
  completed: 'completed',
  cancel: 'cancel',
};

export function useNotificationSound() {
  return useCallback((name: NotificationSoundName) => {
    if (name === 'arriving') {
      playSoundTimes(SOUND_TYPE[name], 3);
    } else {
      playSound(SOUND_TYPE[name]);
    }
    if (navigator.vibrate) navigator.vibrate(name === 'request' ? [200, 100, 200] : [100]);
    if (name === 'request') {
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {
        // no-op on platforms/browsers without haptics support
      });
    }
  }, []);
}
