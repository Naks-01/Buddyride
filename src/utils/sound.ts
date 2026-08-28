// Notification sounds for ride events. WAV format is used because real mp3 assets
// aren't available in this environment; swap in licensed mp3s under public/sounds/ later if desired.
export type SoundType = 'request' | 'accepted' | 'arrived' | 'cancel';

let muted = false;

export const setSoundMuted = (value: boolean) => {
  muted = value;
};

export const isSoundMuted = () => muted;

export const playSound = (type: SoundType): HTMLAudioElement => {
  const audio = new Audio();
  switch (type) {
    case 'request':
      audio.src = '/sounds/ride-request.wav';
      audio.loop = true;
      audio.volume = 1.0;
      break;
    case 'accepted':
      audio.src = '/sounds/ride-accepted.wav';
      audio.volume = 0.8;
      break;
    case 'arrived':
      audio.src = '/sounds/ride-arrived.wav';
      audio.volume = 0.8;
      break;
    case 'cancel':
      audio.src = '/sounds/ride-cancel.wav';
      audio.volume = 0.6;
      break;
  }
  if (!muted) {
    audio.play().catch(() => {
      // autoplay blocked, need user interaction
      console.log('Sound blocked - waiting for tap');
    });
  }
  return audio;
};

export let requestAudio: HTMLAudioElement | null = null;

export const startRequestLoop = () => {
  stopRequestLoop();
  requestAudio = playSound('request');
};

export const stopRequestLoop = () => {
  if (requestAudio) {
    requestAudio.pause();
    requestAudio.currentTime = 0;
    requestAudio = null;
  }
};
