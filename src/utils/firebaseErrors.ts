export function getFirebaseErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Bu e-posta adresi zaten kullanılıyor.';
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    case 'auth/weak-password':
      return 'Şifre en az 6 karakter olmalıdır.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-posta veya şifre hatalı.';
    case 'auth/email-not-verified':
      return 'Email adresiniz henüz doğrulanmamış.';
    case 'auth/too-many-requests':
      return 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.';
    case 'auth/network-request-failed':
      return 'Ağ hatası. İnternet bağlantınızı kontrol edin.';
    default:
      return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
}
