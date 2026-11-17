// Development-only sample response so the review UI can be tested without a paid
// API call. Only referenced behind `if (__DEV__)`; everything here is side-effect
// free so production builds drop it entirely.

export const SAMPLE_UI = {
	button: 'Örnek yanıtla dene (geliştirme)',
	notice: 'Bu öneriler örnek yanıttan geldi; görüntünüz analiz edilmedi.',
} as const;

/**
 * Shows every case of the review screen: a grammatical construction and an
 * overlapping expression from one sentence, an ambiguous context, a generated
 * example, and a redundant fragment ("pick up") that starts unselected.
 */
export function sampleAnalysisJson(): string {
	const meantTo = 'None of them were meant to make it, but they did.';
	const meantToTr = 'Hiçbirinin başarması beklenmiyordu ama başardılar.';
	const slack = "Someone has to pick up the slack when she's away.";
	const slackTr = 'O yokken birinin açığı kapatması gerekiyor.';
	return JSON.stringify({
		status: 'unmarked',
		suggestions: [
			{
				phrase: 'be meant to',
				originalText: 'were meant to',
				category: 'grammar_pattern',
				turkishMeaning: '-mesi beklenmek',
				explanation: 'Hiçbirinin başarmasının beklenmediğini anlatıyor; "but they did" bu beklentinin boşa çıktığını gösteriyor.',
				usage: 'be meant to + yalın fiil. Plan, kader ya da beklenti gereği olması gerekeni anlatır; geçmişte (was/were meant to) çoğu zaman gerçekleşmeyen bir beklentidir.',
				contextNote: '',
				sourceSentence: meantTo,
				sourceTranslation: meantToTr,
				exampleSentence: 'This room was meant to be a library.',
				exampleTranslation: 'Bu odanın kütüphane olması planlanmıştı.',
				highlighted: false,
			},
			{
				phrase: 'make it',
				originalText: 'make it',
				category: 'expression',
				turkishMeaning: 'başarmak',
				explanation: 'Zor bir durumu atlatıp hedefe ulaşmayı anlatıyor; beklenmedik bir başarı söz konusu.',
				usage: 'Nesnesiz kullanılır ve "it" belirli bir şeyi göstermez. make it (to a place) bir yere yetişmek anlamına da gelir.',
				contextNote: 'Önceki cümleler görünmüyor; "make it" burada "başarmak" ya da "hayatta kalmak" anlamında olabilir.',
				sourceSentence: meantTo,
				sourceTranslation: meantToTr,
				exampleSentence: 'She moved to New York to become an actress, and she really made it.',
				exampleTranslation: 'Oyuncu olmak için New York’a taşındı ve gerçekten başardı.',
				highlighted: false,
			},
			{
				phrase: 'pick up the slack',
				originalText: 'pick up the slack',
				category: 'idiom',
				turkishMeaning: 'açığı kapatmak',
				explanation: 'Biri yokken onun yapamadığı işleri başkasının üstlenmesi gerektiğini söylüyor.',
				usage: 'Genellikle "have to" ya da "need to" ile, iş ve ekip bağlamında kullanılır.',
				contextNote: '',
				sourceSentence: slack,
				sourceTranslation: slackTr,
				exampleSentence: 'When Tom got sick, the rest of the team picked up the slack.',
				exampleTranslation: 'Tom hastalanınca ekibin geri kalanı onun işlerini üstlendi.',
				highlighted: false,
			},
			{
				phrase: 'pick up',
				originalText: 'pick up',
				category: 'phrasal_verb',
				turkishMeaning: 'almak',
				explanation: '',
				usage: '',
				contextNote: '',
				sourceSentence: slack,
				sourceTranslation: slackTr,
				exampleSentence: '',
				exampleTranslation: '',
				highlighted: false,
			},
		],
	});
}
