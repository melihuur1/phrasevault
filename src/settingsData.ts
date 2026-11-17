// Plugin settings data (no Obsidian imports, so it can be unit tested).

import { DEFAULT_MODEL } from './ai/analyze';
import { emptyUsageLog, sanitizeUsageLog, type UsageLog } from './core/usageLog';

export interface PhraseVaultSettings {
	/** Name of the secret in Obsidian's SecretStorage — never the key itself. */
	apiKeySecretName: string;
	model: string;
	/** Highest entry number ever issued; guards against reusing deleted numbers. */
	lastIssuedNumber: number;
	/** Local history of estimated API costs (token counts only). */
	usage: UsageLog;
}

export const DEFAULT_SETTINGS: PhraseVaultSettings = {
	apiKeySecretName: '',
	model: DEFAULT_MODEL,
	lastIssuedNumber: 0,
	usage: emptyUsageLog(),
};

/** Accepts only known fields with the right types, so a corrupted data.json cannot break the plugin. */
export function sanitizeSettings(raw: unknown): PhraseVaultSettings {
	const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	const secret = data['apiKeySecretName'];
	const model = data['model'];
	const last = data['lastIssuedNumber'];
	return {
		apiKeySecretName: typeof secret === 'string' ? secret : DEFAULT_SETTINGS.apiKeySecretName,
		model: typeof model === 'string' && model.trim() !== '' ? model.trim() : DEFAULT_SETTINGS.model,
		lastIssuedNumber: typeof last === 'number' && Number.isSafeInteger(last) && last > 0 ? last : 0,
		usage: sanitizeUsageLog(data['usage']),
	};
}
