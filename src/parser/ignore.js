const ignoreRules = [
  ['otp', /\bOTP\b|one[- ]time (pass|code)|verification code|رمز التحقق|رمز التفعيل|كلمة المرور لمرة واحدة|رمز سري مؤقت/i],
  ['declined', /declined|rejected|unsuccessful|insufficient|مرفوض|رفض|لم تتم|غير ناجح|عملية فاشلة/i],
  ['login', /\blog(?:ged)?[- ]?in\b|sign[- ]in|تسجيل (?:ال)?دخول/i],
  ['marketing', /unsubscribe|promo code|عرض خاص|لإلغاء الاشتراك/i],
];

export function ignoreReason(normalizedText) {
  const rule = ignoreRules.find(([, re]) => re.test(normalizedText));
  return rule ? rule[0] : null;
}
