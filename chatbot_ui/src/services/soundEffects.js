// Web Audio API Sound Synthesizer for Zero-Asset Chimes
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playNotificationSound(type = 'message') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'message') {
      // Pleasant 2-tone chime (F#5 -> B5)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(740, now);
      osc1.frequency.exponentialRampToValueAtTime(987, now + 0.15);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.35);
    } else if (type === 'handover') {
      // 3-tone attention alert
      [587, 880, 1174].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const toneTime = now + i * 0.12;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, toneTime);

        gain.gain.setValueAtTime(0.25, toneTime);
        gain.gain.exponentialRampToValueAtTime(0.001, toneTime + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(toneTime);
        osc.stop(toneTime + 0.2);
      });
    } else if (type === 'order') {
      // Cash chime arpeggio (C major)
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const toneTime = now + i * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, toneTime);

        gain.gain.setValueAtTime(0.3, toneTime);
        gain.gain.exponentialRampToValueAtTime(0.001, toneTime + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(toneTime);
        osc.stop(toneTime + 0.3);
      });
    }
  } catch (err) {
    console.error('Audio chime error:', err);
  }
}
