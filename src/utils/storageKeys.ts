// Uygulama genelinde paylaşılan AsyncStorage anahtarları — tek kaynak.
// OnboardingScreen (yazar), RootNavigator (okur) ve AuthContext.signOut (siler)
// aynı anahtar üzerinden onboarding-bir-kez sözleşmesini yürütür.
export const ONBOARDING_STORAGE_KEY = 'onboardingCompleted';
