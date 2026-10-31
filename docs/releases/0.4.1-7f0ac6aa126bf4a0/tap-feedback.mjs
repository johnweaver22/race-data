// Create/resume audio inside a user gesture, including the setup press on iOS.
// Feedback always runs after the timing timestamp has been recorded.
export function createTapFeedback(scope = globalThis) {
  let context = null;

  function ready() {
    try {
      const AudioContext = scope.AudioContext ?? scope.webkitAudioContext;
      if (!AudioContext) return null;
      if (!context || context.state === 'closed') context = new AudioContext();
      if (context.state !== 'running') {
        const resuming = context.resume();
        resuming?.catch(() => {});
      }
      return context;
    } catch { return null; } // Unavailable audio must never block timing.
  }

  return {
    prepare() {
      try {
        const audio = ready();
        if (!audio) return;
        const silent = audio.createBufferSource();
        silent.buffer = audio.createBuffer(1, 1, audio.sampleRate);
        silent.connect(audio.destination);
        silent.onended = () => silent.disconnect();
        silent.start();
      } catch { /* Best effort audio unlock. */ }
    },
    beep() {
      try {
        const audio = ready();
        if (!audio) return;
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime;
        tone.type = 'sine';
        tone.frequency.setValueAtTime(1000, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.005);
        gain.gain.setValueAtTime(0.25, start + 0.045);
        gain.gain.linearRampToValueAtTime(0, start + 0.075);
        tone.connect(gain);
        gain.connect(audio.destination);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(start);
        tone.stop(start + 0.08);
      } catch { /* Keep capturing if audio is blocked or unavailable. */ }
    },
  };
}
