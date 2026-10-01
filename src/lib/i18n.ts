export type Lang = 'en' | 'st' | 'nso';

const translations: Record<Lang, Record<string, string>> = {
	en: {
		admin: 'Admin',
		driver: 'Driver',
		enterOtp: 'Enter the verification code',
		enterPhone: 'Enter your phone number',
		fullName: 'Full name',
		loading: 'Loading...',
		passenger: 'Passenger',
		phoneNumber: 'Phone number',
		resendCode: 'Resend code',
		sendOtp: 'Send code',
		tagline: 'eHailing for Limpopo',
		verifyOtp: 'Verify code',
	},
	st: {
		admin: 'Molaodi',
		driver: 'Mokgweetsi',
		enterOtp: 'Tsenya khoutu ya netefatso',
		enterPhone: 'Tsenya nomoro ya gago ya mogala',
		fullName: 'Leina ka botlalo',
		loading: 'E a laisa...',
		passenger: 'Mopalami',
		phoneNumber: 'Nomoro ya mogala',
		resendCode: 'Romela khoutu gape',
		sendOtp: 'Romela khoutu',
		tagline: 'Ehailing ya Limpopo',
		verifyOtp: 'Netefatsa khoutu',
	},
	nso: {
		admin: 'Molaodi',
		driver: 'Mootledi',
		enterOtp: 'Tsenya khoutu ya netefatšo',
		enterPhone: 'Tsenya nomoro ya mogala wa gago',
		fullName: 'Leina ka botlalo',
		loading: 'E a laiša...',
		passenger: 'Mopalami',
		phoneNumber: 'Nomoro ya mogala',
		resendCode: 'Romela khoutu gape',
		sendOtp: 'Romela khoutu',
		tagline: 'Ehailing ya Limpopo',
		verifyOtp: 'Netefatša khoutu',
	},
};

export function t(key: string, lang: Lang): string {
	return translations[lang][key] ?? translations.en[key] ?? key;
}
