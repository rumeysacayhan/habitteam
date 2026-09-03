// Uygulamanın JS tarafının başladığı ana en yakın zaman damgası
// (bu modül App.tsx'te en üstte import edildiği için erken evaluate olur).
export const APP_START_TIME = Date.now();

// Splash'in ekranda kalacağı minimum süre — çok hızlı cihazlarda
// bir anlığına yanıp sönmesini önler.
export const MIN_SPLASH_DURATION_MS = 1500;
