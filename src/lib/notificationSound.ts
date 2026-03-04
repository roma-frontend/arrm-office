/**
 * 🔔 Notification Sound Manager
 * Beautiful notification sounds for leave requests, approvals, etc.
 */

// Create a pleasant notification sound
export const playNotificationSound = (type: "new_request" | "approved" | "rejected" = "new_request") => {
  if (typeof window === "undefined") return;

  try {
    // Use Web Audio API for better control
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    const duration = 0.5;

    // Create oscillators for different notification types
    if (type === "new_request") {
      // 🔔 Pleasant two-tone chime for new requests
      playChime(audioContext, now, duration);
    } else if (type === "approved") {
      // ✅ Happy uplifting sound for approvals
      playSuccess(audioContext, now, duration);
    } else if (type === "rejected") {
      // ❌ Gentle notification for rejections
      playNotification(audioContext, now, duration);
    }
  } catch (error) {
    // Fallback to HTML5 audio or silent fail
    console.warn("Could not play notification sound:", error);
  }
};

// Two-tone chime for new requests
function playChime(
  context: AudioContext | (any),
  startTime: number,
  duration: number
) {
  const frequencies = [523.25, 659.25]; // C5, E5
  frequencies.forEach((freq, idx) => {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.frequency.value = freq;
    osc.type = "sine";

    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.05);
    gain.gain.setValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(context.destination);

    const delay = idx * 0.1;
    osc.start(startTime + delay);
    osc.stop(startTime + delay + duration);
  });
}

// Happy uplifting sound for approvals
function playSuccess(
  context: AudioContext | (any),
  startTime: number,
  duration: number
) {
  const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
  frequencies.forEach((freq, idx) => {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.frequency.value = freq;
    osc.type = "sine";

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.05);
    gain.gain.setValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(context.destination);

    const delay = idx * 0.08;
    osc.start(startTime + delay);
    osc.stop(startTime + delay + duration);
  });
}

// Gentle notification sound
function playNotification(
  context: AudioContext | (any),
  startTime: number,
  duration: number
) {
  const frequencies = [439.74, 523.25]; // A4, C5
  frequencies.forEach((freq, idx) => {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.frequency.value = freq;
    osc.type = "sine";

    gain.gain.setValueAtTime(0.2, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.05);
    gain.gain.setValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(context.destination);

    const delay = idx * 0.12;
    osc.start(startTime + delay);
    osc.stop(startTime + delay + duration);
  });
}

/**
 * 💬 Beautiful soft chat message sound
 * A gentle water-drop + harmonic chime — easy on the ears
 */
export const playChatMessageSound = () => {
  if (typeof window === "undefined") return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Layer 1: soft "ping" — sine wave at 880Hz (A5), short attack, long tail
    const ping = ctx.createOscillator();
    const pingGain = ctx.createGain();
    ping.type = "sine";
    ping.frequency.setValueAtTime(880, now);
    ping.frequency.exponentialRampToValueAtTime(660, now + 0.3); // slight fall = natural resonance
    pingGain.gain.setValueAtTime(0, now);
    pingGain.gain.linearRampToValueAtTime(0.18, now + 0.012);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    ping.connect(pingGain);
    pingGain.connect(ctx.destination);
    ping.start(now);
    ping.stop(now + 0.6);

    // Layer 2: harmonic undertone — sine at 440Hz (A4), softer, gives warmth
    const warm = ctx.createOscillator();
    const warmGain = ctx.createGain();
    warm.type = "sine";
    warm.frequency.value = 440;
    warmGain.gain.setValueAtTime(0, now);
    warmGain.gain.linearRampToValueAtTime(0.07, now + 0.02);
    warmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    warm.connect(warmGain);
    warmGain.connect(ctx.destination);
    warm.start(now);
    warm.stop(now + 0.5);

    // Layer 3: second tiny chime — 1320Hz (E6), delayed, sparkle effect
    const sparkle = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    sparkle.type = "sine";
    sparkle.frequency.value = 1320;
    sparkleGain.gain.setValueAtTime(0, now + 0.07);
    sparkleGain.gain.linearRampToValueAtTime(0.06, now + 0.09);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(ctx.destination);
    sparkle.start(now + 0.07);
    sparkle.stop(now + 0.45);

  } catch {
    // silent fail
  }
};

// Request permission and play sound
export const requestNotificationPermission = () => {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      return true;
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        return permission === "granted";
      });
      return false;
    }
  }
  return false;
};

// Send browser notification with sound
export const sendBrowserNotification = (
  title: string,
  options?: NotificationOptions & { soundType?: "new_request" | "approved" | "rejected" }
) => {
  if (typeof window === "undefined") return;

  const soundType = options?.soundType || "new_request";
  delete (options as any)?.soundType;

  // Play sound
  playNotificationSound(soundType);

  // Send browser notification if permitted
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        ...options,
      });
    } catch (error) {
      console.warn("Could not send browser notification:", error);
    }
  }
};
