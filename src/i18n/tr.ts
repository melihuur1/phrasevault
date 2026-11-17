// All user-facing Turkish text lives here. Code and identifiers stay in English.

import type { AnalyzeErrorCode } from '../ai/analyze';
import type { AnalysisStatus } from '../ai/schema';
import type { ClipboardProblem } from '../clipboard';
import type { CostUnavailableReason } from '../core/cost';
import type { ApiImageRejection, ImageProblem } from '../core/imageInput';
import type { PhraseCategory } from '../core/types';
import type { SaveFailureReason } from '../vault/vaultStore';

export const CATEGORY_LABELS: Record<PhraseCategory, string> = {
	phrasal_verb: 'Phrasal verb',
	idiom: 'Deyim',
	collocation: 'Eşdizim (collocation)',
	expression: 'Kalıp ifade',
};

export const NOTE_LABELS = {
	category: 'Kategori',
	meaning: 'Türkçe anlam',
	explanation: 'Açıklama',
	createdOn: 'Eklenme tarihi',
} as const;

export const COMMANDS = {
	importClipboard: 'Panodan ekran görüntüsü içe aktar',
	importFile: 'Dosyadan ekran görüntüsü içe aktar',
	prepareStructure: 'Klasör yapısını ve INDEX.md dosyasını hazırla',
	ribbon: 'PhraseVault: ekran görüntüsünden ifade ekle',
} as const;

export const UI = {
	modalTitle: 'PhraseVault — ekran görüntüsünden ifade ekle',
	emptyHint: 'Win+Shift+S ile ekran görüntüsü alın, ardından bu pencerede Ctrl+V’ye basın.',
	emptySubHint: 'Ya da panodaki görüntüyü okuyun veya bir PNG/JPEG dosyası seçin.',
	pasteFromClipboard: 'Panodan yapıştır',
	chooseFile: 'Dosya seç',
	changeImage: 'Görseli değiştir',
	analyze: 'Analiz et',
	analyzeAgain: 'Yeniden analiz et',
	useCachedAnalysis: 'Önceki analizi göster',
	cancel: 'İptal',
	retry: 'Tekrar dene',
	analyzing: 'Analiz ediliyor… Bu birkaç saniye sürebilir.',
	privacy: 'Bu görsel, yalnızca “Analiz et” düğmesine bastığınızda analiz için Anthropic’e gönderilir.',
	cachedInfo: 'Bu görüntü bu oturumda zaten analiz edildi; önceki sonuçlar ücretsiz olarak yeniden gösterilebilir.',
	analysisCancelled: 'Analiz iptal edildi. Görüntü gönderilmeye devam edilmedi.',
	nextNumber: (id: string) => `Sıradaki numara: ${id}`,
	imageMeta: (width: number, height: number, format: string, size: string) => `${width} × ${height} px · ${format} · ${size}`,
	busy: 'PhraseVault şu anda meşgul; işlem bitince tekrar deneyin.',
	finishReviewFirst: 'Yeni görüntü için önce mevcut önerileri kaydedin veya “Yeni görüntü”yü seçin.',
	newImage: 'Yeni görüntü',
	backToPreview: 'Önizlemeye dön',
	close: 'Kapat',
} as const;

export const REVIEW = {
	heading: (count: number) => `Öneriler (${count})`,
	status: {
		highlighted: 'Vurgulanan ifade bulundu. Önerileri kontrol edip düzenleyin.',
		unmarked: 'Metinden öne çıkan ifadeler. Kaydetmek istediklerinizi seçin.',
		ambiguous: 'Vurgulanan ifade net değil; doğru olanı seçin veya düzenleyin.',
		no_english_text: 'Görselde okunabilir İngilizce metin bulunamadı.',
	} satisfies Record<AnalysisStatus, string>,
	noSuggestions: 'Kullanışlı ifade bulunamadı. İsterseniz ifadeyi elle ekleyebilirsiniz.',
	manualOnly: 'İfadeyi elle girin. Ekran görüntüsü notlara eklenecektir.',
	addManual: '+ Elle ifade ekle',
	remove: 'Kaldır',
	save: (count: number) => `Seçilenleri kaydet (${count})`,
	select: 'Kaydet',
	badgeHighlighted: 'Vurgulu',
	badgeManual: 'Elle eklendi',
	badgeSourceMismatch: '⚠ Kaynak cümlede bulunamadı',
	sourceMismatchHelp: 'Orijinal metin, kaynak cümlede geçmiyor. Yapay zekâ metni yanlış okumuş olabilir; lütfen kontrol edin.',
	duplicateExisting: (id: string, meaning: string | null) => `⚠ Zaten kayıtlı: ${id}${meaning ? ` — ${meaning}` : ''}`,
	duplicateInBatch: '⚠ Bu listede aynı ifade daha önce seçildi.',
	duplicateOverride: 'Farklı anlamla yine de kaydet',
	requiredMissing: 'İfade ve Türkçe anlam alanları zorunludur.',
	overrideRequired: 'Bu ifade zaten var. Kaydetmek için “Farklı anlamla yine de kaydet” seçeneğini işaretleyin.',
	fixBeforeSaving: 'Kaydetmeden önce işaretli kartlardaki sorunları düzeltin.',
	nothingSelected: 'Kaydetmek için en az bir ifade seçin.',
	fields: {
		phrase: 'İfade',
		originalText: 'Orijinal metin',
		category: 'Kategori',
		turkishMeaning: 'Türkçe anlam',
		explanation: 'Açıklama',
		sourceSentence: 'Kaynak cümle',
	},
	placeholders: {
		phrase: 'ör. put off',
		originalText: 'Görüntüdeki hâli, ör. putting off',
		turkishMeaning: 'ör. ertelemek',
		explanation: 'Kısa Türkçe açıklama',
		sourceSentence: 'İfadenin geçtiği cümle',
	},
} as const;

export const DONE = {
	saving: 'Kaydediliyor…',
	savedHeading: (count: number) => `${count} ifade kaydedildi`,
	nothingSaved: 'Hiçbir ifade kaydedilemedi',
	openNote: 'Notu aç',
	openIndex: 'INDEX.md’yi aç',
	retryRemaining: (count: number) => `Kalan ${count} ifadeyi düzenle ve tekrar dene`,
	indexCreated: 'INDEX.md bulunamadığı için yeniden oluşturuldu. Önceki girdiler varsa INDEX.md’yi kontrol edin.',
	notIndexed: (ids: string) => `Not oluşturuldu ancak INDEX.md’ye eklenemedi: ${ids}. Not güvende; INDEX.md’yi kontrol edin.`,
	notAttempted: (count: number) => `${count} ifade denenmedi.`,
	notice: (count: number, range: string) => `PhraseVault: ${count} ifade kaydedildi (${range}).`,
	failure: {
		structure_conflict: 'Phrases, Attachments veya INDEX.md adıyla beklenmeyen bir öğe var (ör. klasör yerine dosya). Lütfen kontrol edin.',
		structure_failed: 'Klasör yapısı oluşturulamadı.',
		attachment_failed: 'Ekran görüntüsü Attachments klasörüne kaydedilemedi; hiçbir not oluşturulmadı.',
		note_collision_limit: 'Uygun bir not numarası bulunamadı (dosyalar sürekli çakıştı). Hiçbir mevcut not değiştirilmedi.',
		note_write_failed: 'Not dosyası oluşturulamadı.',
		index_conflict: 'INDEX.md kaydetme sırasında değişti; girdi güvenlik için eklenmedi. Mevcut satırlar değiştirilmedi.',
		index_write_failed: 'INDEX.md güncellenemedi.',
	} satisfies Record<SaveFailureReason, string>,
} as const;

export const STRUCTURE = {
	ready: 'PhraseVault: Phrases, Attachments ve INDEX.md hazır.',
	created: 'PhraseVault: klasör yapısı ve INDEX.md oluşturuldu.',
	failed: 'PhraseVault: klasör yapısı hazırlanamadı. Aynı adda bir dosya veya klasör olabilir.',
} as const;

export const CLIPBOARD_PROBLEMS: Record<ClipboardProblem, string> = {
	empty: 'Panoda görsel bulunamadı. Win+Shift+S ile ekran görüntüsü alın, ardından bu pencerede Ctrl+V’ye basın.',
	text_only: 'Panoda görsel yok, yalnızca metin var. Ekran görüntüsü alıp tekrar deneyin.',
	unsupported: 'Panodaki görsel biçimi desteklenmiyor. Yalnızca PNG ve JPEG desteklenir.',
	denied: 'Panoya erişim izni verilmedi. Bu pencerede Ctrl+V ile yapıştırmayı veya dosya seçmeyi deneyin.',
	unavailable: 'Pano okunamadı. Bu pencerede Ctrl+V ile yapıştırmayı veya dosya seçmeyi deneyin.',
	failed: 'Pano okunurken bir hata oluştu. Ctrl+V ile yapıştırmayı veya dosya seçmeyi deneyin.',
};

export const PASTE_UNSUPPORTED = 'Yapıştırılan görsel biçimi desteklenmiyor. Yalnızca PNG ve JPEG desteklenir.';

export const IMAGE_PROBLEMS: Record<ImageProblem, string> = {
	empty: 'Görsel boş.',
	too_large: 'Görsel çok büyük (en fazla 20 MB).',
	unsupported_format: 'Desteklenmeyen görsel biçimi. Yalnızca PNG ve JPEG desteklenir.',
	corrupt: 'Görsel okunamadı; dosya bozuk olabilir.',
	too_small: 'Görsel okunabilir metin içeremeyecek kadar küçük.',
};

export const PREPARE_PROBLEMS: Record<ApiImageRejection | 'decode_failed', string> = {
	format: 'Görsel, API için uygun biçime dönüştürülemedi; gönderilmedi.',
	unreadable: 'Görsel API için hazırlanırken okunamadı; gönderilmedi.',
	dimensions: 'Görsel boyutları API sınırlarına uygun hâle getirilemedi; gönderilmedi.',
	too_large: 'Görsel, küçültüldükten sonra bile API boyut sınırını aşıyor; gönderilmedi.',
	decode_failed: 'Görsel çözümlenemedi; dosya bozuk olabilir. Gönderilmedi.',
};

export const MISSING_KEY = 'API anahtarı ayarlanmamış. Ayarlar → PhraseVault bölümünden Anthropic API anahtarınızı ekleyin.';

export const ANALYZE_ERRORS: Record<AnalyzeErrorCode, string> = {
	invalid_key: 'API anahtarı geçersiz. Ayarlar → PhraseVault bölümünden anahtarı kontrol edin.',
	permission: 'Bu API anahtarının seçili modele erişim izni yok.',
	billing: 'Anthropic kredi bakiyesi yetersiz. Anthropic Console üzerinden kredi ekleyin.',
	rate_limited: 'Kısa sürede çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin.',
	overloaded: 'Anthropic servisi şu anda yoğun. Biraz sonra tekrar deneyin.',
	server_error: 'Anthropic servisinde geçici bir hata oluştu. Tekrar deneyin.',
	network: 'İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.',
	timeout: 'İstek zaman aşımına uğradı. Tekrar deneyin.',
	aborted: 'Analiz iptal edildi.',
	image_rejected: 'Görsel API tarafından kabul edilmedi (boyut veya biçim).',
	model_not_found: 'Model bulunamadı. Ayarlardaki model adını kontrol edin.',
	bad_request: 'İstek API tarafından reddedildi.',
	refusal: 'Model bu görüntüyü analiz etmeyi reddetti. İfadeyi elle ekleyebilirsiniz.',
	truncated: 'Yanıt yarıda kesildi. Tekrar deneyin.',
	invalid_response: 'Yapay zekâ geçersiz bir yanıt döndürdü. Tekrar deneyin veya ifadeyi elle ekleyin.',
	unknown: 'Beklenmeyen bir hata oluştu. Tekrar deneyin veya ifadeyi elle ekleyin.',
};

export const COST = {
	estimated: (amount: string) => `Tahmini maliyet: ${amount}`,
	unavailable: 'Maliyet hesaplanamadı',
	tokens: (input: number, output: number) => `giriş ${input} · çıkış ${output} token`,
	reused: 'Önceki analiz gösteriliyor; yeniden ücretlendirilmedi.',
	model: (model: string) => `Model: ${model}`,
	requestedAt: (when: string) => `İstek zamanı: ${when}`,
	inputTokens: (n: number) => `Giriş: ${n} token (ekran görüntüsü dahil)`,
	outputTokens: (n: number) => `Çıkış: ${n} token (modelin düşünme adımları dahil)`,
	cacheTokens: (write: number, read: number) => `Önbellek: ${write} token yazma, ${read} token okuma`,
	pricing: (date: string) => `Anthropic’in standart API fiyatlarıyla hesaplandı (${date} itibarıyla).`,
	total: (amount: string, count: number) => `Bu cihazdaki toplam: ${amount} (${count} analiz)`,
	disclaimer: 'Bu tutar, API yanıtındaki token sayılarından yerel olarak hesaplanan bir tahmindir. Kesin tutar Anthropic Console’daki faturanızda görünür.',
	billedFailure: (amount: string) => `Bu yanıt kullanılamadı ancak ücretlendirilmiş olabilir. Tahmini maliyet: ${amount}.`,
	reasons: {
		no_usage: 'API yanıtı token kullanımını bildirmedi.',
		unknown_model: 'Bu model için PhraseVault’ta fiyat bilgisi yok.',
		unsupported_tier: 'İstek standart dışı bir hizmet katmanında (ör. Priority Tier) işlendi.',
		unsupported_speed: 'İstek, fiyatı bilinmeyen hızlı modda işlendi.',
		unsupported_region: 'İstek, fiyatı bilinmeyen bir bölgede işlendi.',
		unknown_cache_ttl: 'Önbelleğe yazılan tokenların süresi bildirilmedi.',
	} satisfies Record<CostUnavailableReason, string>,
} as const;

export const SETTINGS = {
	apiKeyName: 'Anthropic API anahtarı',
	apiKeyDesc: 'Anahtar, Obsidian’ın gizli anahtar deposunda saklanır. Eklenti ayarlarında yalnızca anahtarın adı tutulur; anahtarın kendisi hiçbir dosyaya yazılmaz.',
	modelName: 'Model',
	modelDesc: (defaultModel: string) => `Kullanılacak Claude modeli. Varsayılan: ${defaultModel}`,
	privacyHeading: 'Gizlilik ve maliyet',
	privacyName: 'Gönderilen veriler',
	privacyDesc:
		'“Analiz et” düğmesine bastığınızda yalnızca önizlemede gördüğünüz ekran görüntüsü ve sabit bir talimat metni Anthropic API’ye gönderilir. Kasanızdaki diğer notlar hiçbir zaman gönderilmez. Ekran görüntüsünde kişisel bilgi varsa göndermeden önce kontrol edin.',
	costName: 'Maliyet',
	costDesc:
		'API kullanımı Claude Pro aboneliğine dahil değildir; Anthropic Console üzerinden ön ödemeli kredi gerekir. Claude Haiku 5.5 ile bir ekran görüntüsünün analizi genellikle 0,001–0,002 ABD doları tutar; her analizin tahmini maliyeti sonuç ekranında gösterilir.',
	usageHeading: 'Kullanım ve tahmini maliyet',
	usageTotalName: 'Toplam tahmini maliyet',
	usageEmpty: 'Henüz kayıtlı analiz yok.',
	usageTotal: (amount: string, priced: number, unpriced: number, since: string) =>
		`${amount} · ${priced} analiz${unpriced > 0 ? `, ${unpriced} analizin maliyeti hesaplanamadı` : ''} · ${since} tarihinden beri`,
	usageRecentName: 'Son analizler',
	usageRecentEmpty: 'Kayıt yok.',
	usageRecentDesc: 'Bu cihazda saklanır; yalnızca tarih, model, token sayıları ve tahmini tutar tutulur (görsel veya anahtar yok).',
	usageRecord: (when: string, model: string, input: number, output: number, amount: string) =>
		`${when} · ${model} · giriş ${input} / çıkış ${output} token · ${amount}`,
	usageDisclaimerName: 'Tahminin sınırları',
	usageDisclaimer: (date: string) =>
		`Tutarlar, API’nin bildirdiği token sayıları ve Anthropic’in yayımladığı fiyatlar (${date} itibarıyla) kullanılarak yerel olarak hesaplanır. Fatura tutarıyla birebir aynı olmayabilir; kesin tutar Anthropic Console’da görünür. İptal edilen veya zaman aşımına uğrayan istekler yanıt gelmediği için sayılamaz.`,
	resetButton: 'Geçmişi sıfırla',
	resetTitle: 'Kullanım geçmişi sıfırlansın mı?',
	resetMessage: 'Bu cihazdaki tahmini maliyet toplamı ve son analiz kayıtları silinir. Notlarınız ve Anthropic hesabınız etkilenmez.',
	resetConfirm: 'Sıfırla',
	resetCancel: 'Vazgeç',
	resetDone: 'PhraseVault: kullanım geçmişi sıfırlandı.',
} as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026-11-18T10:30:00Z" → "18.11.2026 13:30" in local time. */
export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "2026-11-18T10:30:00Z" → "18.11.2026" in local time. */
export function formatDate(iso: string): string {
	return formatDateTime(iso).split(' ')[0] ?? iso;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
