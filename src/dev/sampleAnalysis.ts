// Development-only sample response so the review UI can be tested without a paid
// API call. Only referenced behind `if (__DEV__)`; everything here is side-effect
// free so production builds drop it entirely.

export const SAMPLE_UI = {
	button: 'Örnek yanıtla dene (geliştirme)',
	notice: 'Bu öneriler örnek yanıttan geldi; görüntünüz analiz edilmedi.',
} as const;

export function sampleAnalysisJson(): string {
	return JSON.stringify({
		status: 'unmarked',
		suggestions: [
			{
				phrase: 'run out of',
				originalText: 'ran out of',
				category: 'phrasal_verb',
				turkishMeaning: '-in tükenmesi, bitmesi',
				explanation: 'Bir şeyin (burada sabrın) tamamen bitmesi anlamında kullanılır.',
				sourceSentence: 'She ran out of patience and decided to call it a day.',
				highlighted: false,
			},
			{
				phrase: 'call it a day',
				originalText: 'call it a day',
				category: 'idiom',
				turkishMeaning: 'paydos etmek, bugünlük bırakmak',
				explanation: 'Bir işi o gün için bitirmeye karar vermek.',
				sourceSentence: 'She ran out of patience and decided to call it a day.',
				highlighted: false,
			},
			{
				phrase: 'put off',
				originalText: 'putting off',
				category: 'phrasal_verb',
				turkishMeaning: 'ertelemek',
				explanation: 'Yapılması gereken bir işi sonraya bırakmak.',
				sourceSentence: 'Her colleagues had been putting off the task for weeks.',
				highlighted: false,
			},
		],
	});
}
