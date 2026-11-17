import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import { AnalyzeError, analyzeScreenshot, createAnthropicSender } from '../ai/analyze';
import { parseAnalysisText, type AnalysisResult } from '../ai/validate';
import { blobToBytes, classifyPaste, pickImageFile, readImageFromClipboard } from '../clipboard';
import { extensionOf, importImageBytes, toArrayBuffer, type ImageBytes, type ImportedImage } from '../core/imageInput';
import { formatLocalDate } from '../core/noteMarkdown';
import type { UsageRecord } from '../core/usageLog';
import { formatNumber } from '../core/numbering';
import type { KnownPhrase } from '../core/types';
import { SAMPLE_UI, sampleAnalysisJson } from '../dev/sampleAnalysis';
import {
	ANALYZE_ERRORS,
	CLIPBOARD_PROBLEMS,
	COST,
	DISCARD,
	DONE,
	formatBytes,
	IMAGE_PROBLEMS,
	MISSING_KEY,
	PASTE_UNSUPPORTED,
	PREPARE_PROBLEMS,
	REVIEW,
	UI,
} from '../i18n/tr';
import { prepareApiImage } from '../imagePrep';
import { INDEX_PATH } from '../constants';
import type PhraseVaultPlugin from '../main';
import { confirmAction } from './ConfirmModal';
import { costLabel, renderCostSummary } from './costView';
import type { SaveReport } from '../vault/vaultStore';
import {
	blankCard,
	cardsFromAnalysis,
	describeNumberRange,
	evaluateCards,
	hasUnsavedChanges,
	planSave,
	remainingCardsAfterSave,
	snapshotCards,
	type CardState,
} from './reviewModel';
import { SuggestionCard } from './SuggestionCard';

export type ImportSource = 'clipboard' | 'file' | 'none';

type Phase = 'empty' | 'preview' | 'analyzing' | 'review' | 'saving' | 'done';

interface StatusMessage {
	kind: 'error' | 'info';
	text: string;
}

/** Where the suggestions on screen came from, for the cost line. */
interface ApiOrigin {
	usage: UsageRecord;
	/** Shown again from this session's cache: no new request, nothing billed or counted again. */
	reused: boolean;
}

/**
 * The main PhraseVault window. The screenshot is only sent to the AI when the
 * user clicks "Analiz et"; importing and previewing never touch the network.
 */
export class ImportModal extends Modal {
	private phase: Phase = 'empty';
	private image: ImportedImage | null = null;
	private previewUrl: string | null = null;
	private message: StatusMessage | null = null;
	private abortController: AbortController | null = null;
	private analysis: AnalysisResult | null = null;
	private origin: ApiOrigin | null = null;
	private closed = false;
	private busyLoading = false;
	/** Set once leaving is confirmed (or nothing can be lost), so close() goes through. */
	private closeConfirmed = false;
	private confirmingDiscard = false;

	// Review state
	private cards: CardState[] = [];
	private cardViews = new Map<number, SuggestionCard>();
	/** Card states the user has not changed since they appeared (or since the last save). */
	private baseline = new Map<number, string>();
	private known: KnownPhrase[] = [];
	private attemptedSave = false;
	private saveButton: ButtonComponent | null = null;
	private reviewMessageEl: HTMLElement | null = null;
	private nextCardId = 1;
	private report: SaveReport | null = null;
	private checkingBeforeSave = false;

	constructor(
		app: App,
		private readonly plugin: PhraseVaultPlugin,
		private readonly initialSource: ImportSource,
	) {
		super(app);
		this.setTitle(UI.modalTitle);
	}

	onOpen(): void {
		this.modalEl.addClass('phrasevault-modal');
		this.modalEl.doc.addEventListener('paste', this.onPaste);
		this.render();
		void this.handleImportRequest(this.initialSource);
	}

	onClose(): void {
		this.closed = true;
		this.abortController?.abort();
		this.modalEl.doc.removeEventListener('paste', this.onPaste);
		this.revokePreview();
		this.contentEl.empty();
		this.plugin.onImportModalClosed(this);
	}

	private get isBusy(): boolean {
		return this.phase === 'analyzing' || this.phase === 'saving' || this.busyLoading;
	}

	// ── Leaving without losing edits ─────────────────────────────────────────

	/** Edited or not-yet-saved suggestions that closing or starting over would discard. */
	hasUnsavedChanges(): boolean {
		if (this.phase !== 'review' && this.phase !== 'done') return false;
		return hasUnsavedChanges(this.cards, this.baseline);
	}

	/**
	 * Every normal way of closing ends up here: Escape, a click outside the
	 * window, the close button, and our own buttons. Asks first when edits
	 * would be lost.
	 */
	close(): void {
		if (this.closed || this.closeConfirmed || !this.hasUnsavedChanges()) {
			super.close();
			return;
		}
		void this.confirmDiscard().then((discard) => {
			if (discard) this.forceClose();
		});
	}

	/** Closes without asking (plugin unload, or after the user chose to discard). */
	forceClose(): void {
		this.closeConfirmed = true;
		super.close();
	}

	/** Resolves true when nothing would be lost or the user chose "Değişiklikleri at". */
	private async confirmDiscard(): Promise<boolean> {
		if (!this.hasUnsavedChanges()) return true;
		if (this.confirmingDiscard) return false;
		this.confirmingDiscard = true;
		try {
			return await confirmAction(this.app, {
				title: DISCARD.title,
				message: DISCARD.message,
				confirmText: DISCARD.discard,
				cancelText: DISCARD.keepEditing,
			});
		} finally {
			this.confirmingDiscard = false;
		}
	}

	/** Runs an action that throws the current cards away, after confirming if needed. */
	private discardThen(action: () => void): void {
		void this.confirmDiscard().then((discard) => {
			if (discard && !this.closed) action();
		});
	}

	/** Called by commands; a second import while open loads into this window. */
	async handleImportRequest(source: ImportSource): Promise<void> {
		if (source === 'none') return;
		if (this.isBusy) {
			new Notice(UI.busy);
			return;
		}
		if (this.phase === 'review' || this.hasUnsavedChanges()) {
			new Notice(UI.finishReviewFirst);
			return;
		}
		if (source === 'clipboard') await this.importFromClipboard();
		else await this.importFromFile();
	}

	// ── Image input ──────────────────────────────────────────────────────────

	private onPaste = (event: ClipboardEvent): void => {
		if (this.closed) return;
		const content = classifyPaste(event.clipboardData);
		if (content.kind === 'other') return; // ordinary text paste into a field
		event.preventDefault();
		if (this.isBusy) {
			new Notice(UI.busy);
			return;
		}
		if (this.phase === 'review' || this.hasUnsavedChanges()) {
			new Notice(UI.finishReviewFirst);
			return;
		}
		if (content.kind === 'unsupported_image') {
			this.showMessage({ kind: 'error', text: PASTE_UNSUPPORTED });
			return;
		}
		void blobToBytes(content.blob).then((bytes) => this.loadBytes(bytes));
	};

	private async importFromClipboard(): Promise<void> {
		const result = await readImageFromClipboard(this.modalEl.win.navigator.clipboard);
		if (this.closed) return;
		if (!result.ok) {
			this.showMessage({ kind: 'error', text: CLIPBOARD_PROBLEMS[result.problem] });
			return;
		}
		await this.loadBytes(result.bytes);
	}

	private async importFromFile(): Promise<void> {
		const file = await pickImageFile(this.modalEl.doc);
		if (this.closed || file === null) return;
		await this.loadBytes(await blobToBytes(file));
	}

	private async loadBytes(bytes: ImageBytes): Promise<void> {
		this.busyLoading = true;
		try {
			const result = await importImageBytes(bytes);
			if (this.closed) return;
			if (!result.ok) {
				// Keep any previously loaded image; just explain the problem.
				this.showMessage({ kind: 'error', text: IMAGE_PROBLEMS[result.problem] });
				return;
			}
			this.setImage(result.image);
		} finally {
			this.busyLoading = false;
		}
	}

	private setImage(image: ImportedImage): void {
		this.revokePreview();
		this.image = image;
		this.previewUrl = URL.createObjectURL(new Blob([image.bytes], { type: image.format === 'png' ? 'image/png' : 'image/jpeg' }));
		this.analysis = null;
		this.clearReview();
		this.phase = 'preview';
		this.message = this.plugin.getCachedAnalysis(image.hash) ? { kind: 'info', text: UI.cachedInfo } : null;
		this.render();
	}

	private revokePreview(): void {
		if (this.previewUrl !== null) URL.revokeObjectURL(this.previewUrl);
		this.previewUrl = null;
	}

	private resetToEmpty(): void {
		this.revokePreview();
		this.image = null;
		this.analysis = null;
		this.clearReview();
		this.phase = 'empty';
		this.message = null;
		this.render();
	}

	private backToPreview(): void {
		this.clearReview();
		this.analysis = null;
		this.phase = this.image === null ? 'empty' : 'preview';
		this.message = null;
		this.render();
	}

	// ── Analysis ─────────────────────────────────────────────────────────────

	private async analyze(options: { force: boolean }): Promise<void> {
		const image = this.image;
		if (image === null || this.isBusy) return;

		const cached = options.force ? undefined : this.plugin.getCachedAnalysis(image.hash);
		if (cached !== undefined) {
			this.showAnalysis(cached.analysis, { usage: cached.usage, reused: true });
			return;
		}

		const apiKey = this.plugin.getApiKey();
		if (apiKey === null) {
			this.showMessage({ kind: 'error', text: MISSING_KEY });
			return;
		}

		const controller = new AbortController();
		this.abortController = controller;
		this.phase = 'analyzing';
		this.message = null;
		this.render();

		try {
			const prepared = await prepareApiImage(image, this.modalEl.doc);
			if (this.closed || controller.signal.aborted) {
				this.afterCancel(controller);
				return;
			}
			if (!prepared.ok) {
				this.phase = 'preview';
				this.showMessage({ kind: 'error', text: PREPARE_PROBLEMS[prepared.reason] });
				return;
			}

			const outcome = await analyzeScreenshot(createAnthropicSender(apiKey), prepared.image, {
				model: this.plugin.settings.model,
				signal: controller.signal,
			});
			// The response was billed: record and cache it even if the window closed meanwhile.
			const usage = this.plugin.recordUsage(outcome.billing);
			this.plugin.rememberAnalysis(image.hash, { analysis: outcome.analysis, usage });
			if (this.closed || this.image !== image) return;
			this.showAnalysis(outcome.analysis, { usage, reused: false });
		} catch (error) {
			const failure = error instanceof AnalyzeError ? error : null;
			// An unusable answer (refusal, truncated, invalid) was still billed.
			const billed = failure?.billing ? this.plugin.recordUsage(failure.billing) : null;
			if (this.closed || this.image !== image) return;
			const code = failure?.code ?? 'unknown';
			const billedNote = billed === null ? '' : ` ${COST.billedFailure(costLabel(billed))}`;
			this.phase = 'preview';
			this.showMessage(code === 'aborted' ? { kind: 'info', text: UI.analysisCancelled } : { kind: 'error', text: ANALYZE_ERRORS[code] + billedNote });
		} finally {
			if (this.abortController === controller) this.abortController = null;
		}
	}

	private afterCancel(controller: AbortController): void {
		if (this.closed || this.abortController !== controller) return;
		this.phase = 'preview';
		this.showMessage({ kind: 'info', text: UI.analysisCancelled });
	}

	private cancelAnalysis(): void {
		this.abortController?.abort();
	}

	private runSampleAnalysis(): void {
		// The __DEV__ guard lets production builds drop the sample data entirely.
		if (__DEV__) this.showAnalysis(parseAnalysisText(sampleAnalysisJson()), 'sample');
	}

	private showAnalysis(result: AnalysisResult, origin: ApiOrigin | 'sample'): void {
		this.clearReview();
		this.analysis = result;
		this.origin = origin === 'sample' ? null : origin;
		this.cards = cardsFromAnalysis(result, () => this.nextCardId++);
		this.baseline = snapshotCards(this.cards);
		this.phase = 'review';
		this.message = __DEV__ && origin === 'sample' ? { kind: 'info', text: SAMPLE_UI.notice } : null;
		this.render();
		void this.loadKnownPhrases();
	}

	// ── Review ───────────────────────────────────────────────────────────────

	private clearReview(): void {
		this.origin = null;
		this.report = null;
		this.cards = [];
		this.baseline = new Map();
		this.cardViews.clear();
		this.known = [];
		this.attemptedSave = false;
		this.saveButton = null;
		this.reviewMessageEl = null;
	}

	private startManualEntry(): void {
		if (this.phase !== 'review') {
			this.clearReview();
			this.analysis = null;
			this.phase = 'review';
			this.message = null;
			this.cards = [blankCard(this.nextCardId++)];
			this.render();
			void this.loadKnownPhrases();
			this.cardViews.get(this.cards[0]?.id ?? -1)?.focus();
			return;
		}
		this.addManualCard();
	}

	private addManualCard(): void {
		const card = blankCard(this.nextCardId++);
		this.cards.push(card);
		this.render();
		this.cardViews.get(card.id)?.focus();
	}

	private removeCard(view: SuggestionCard): void {
		this.cards = this.cards.filter((card) => card.id !== view.state.id);
		this.render();
	}

	private async loadKnownPhrases(): Promise<void> {
		try {
			const known = await this.plugin.store.knownPhrases();
			if (this.closed || this.phase !== 'review') return;
			this.known = known;
			this.refreshReview();
		} catch {
			// Duplicate warnings are best-effort; saving never overwrites anything anyway.
		}
	}

	/** Re-evaluates every card and updates warnings and the save button in place. */
	private refreshReview(): void {
		const issues = evaluateCards(this.cards, this.known);
		this.cards.forEach((card, i) => {
			const view = this.cardViews.get(card.id);
			const issue = issues[i];
			if (view !== undefined && issue !== undefined) view.update(issue, this.attemptedSave);
		});
		const selected = this.cards.filter((card) => card.selected).length;
		this.saveButton?.setButtonText(REVIEW.save(selected)).setDisabled(selected === 0 || this.phase === 'saving');
	}

	private setReviewMessage(message: StatusMessage | null): void {
		const el = this.reviewMessageEl;
		if (el === null) return;
		el.empty();
		el.className = '';
		if (message === null) return;
		el.addClass('phrasevault-message', `phrasevault-message-${message.kind}`);
		el.setText(message.text);
		el.setAttr('role', message.kind === 'error' ? 'alert' : 'status');
	}

	private async save(): Promise<void> {
		if (this.isBusy || this.checkingBeforeSave) return;
		this.attemptedSave = true;
		// Re-read existing phrases now, so a duplicate can never slip through before they finished loading.
		this.checkingBeforeSave = true;
		try {
			this.known = await this.plugin.store.knownPhrases();
		} catch {
			// Keep the last known list; saving still never overwrites anything.
		} finally {
			this.checkingBeforeSave = false;
		}
		if (this.closed || this.phase !== 'review') return;
		const plan = planSave(this.cards, this.known);
		if (!plan.ok) {
			this.refreshReview();
			this.setReviewMessage({ kind: 'error', text: plan.reason === 'nothing_selected' ? REVIEW.nothingSelected : REVIEW.fixBeforeSaving });
			if (plan.reason === 'blocked') this.cardViews.get(plan.blockedIds[0] ?? -1)?.focus();
			return;
		}

		this.phase = 'saving';
		this.setReviewMessage({ kind: 'info', text: DONE.saving });
		for (const view of this.cardViews.values()) view.setDisabled(true);
		this.refreshReview();

		const image = this.image;
		let report: SaveReport;
		try {
			report = await this.plugin.store.saveBatch({
				image: image === null ? null : { bytes: toArrayBuffer(image.bytes), extension: extensionOf(image.format), hash: image.hash },
				drafts: plan.drafts,
				createdDate: formatLocalDate(new Date()),
			});
		} catch {
			// saveBatch reports failures itself; this only guards against the unexpected.
			if (this.closed) return;
			this.phase = 'review';
			this.render();
			this.setReviewMessage({ kind: 'error', text: DONE.failure.note_write_failed });
			return;
		}
		const created = [...report.saved, ...report.notIndexed].map((entry) => entry.number);
		if (created.length > 0) new Notice(DONE.notice(created.length, describeNumberRange(created)));
		if (this.closed) return;

		// Cards whose note was created are done; the rest stay available for a retry.
		// Cards that were not part of this save count as untouched; failed ones still need saving.
		const attempted = new Set(plan.cardIds);
		this.cards = remainingCardsAfterSave(this.cards, plan.cardIds, created.length);
		this.baseline = snapshotCards(this.cards.filter((card) => !attempted.has(card.id)));
		this.report = report;
		this.phase = 'done';
		this.render();
	}

	private retryRemaining(): void {
		this.report = null;
		this.attemptedSave = false;
		this.phase = 'review';
		this.message = null;
		this.render();
		void this.loadKnownPhrases();
	}

	private async openPath(path: string): Promise<void> {
		if (!(await this.confirmDiscard())) return;
		this.forceClose();
		await this.app.workspace.openLinkText(path, '', false);
	}

	// ── Rendering ────────────────────────────────────────────────────────────

	private showMessage(message: StatusMessage): void {
		this.message = message;
		this.render();
	}

	private render(): void {
		if (this.closed) return;
		const root = this.contentEl;
		root.empty();
		root.addClass('phrasevault-content');

		switch (this.phase) {
			case 'empty':
				this.renderEmpty(root);
				break;
			case 'preview':
				this.renderPreview(root);
				break;
			case 'analyzing':
				this.renderAnalyzing(root);
				break;
			case 'review':
			case 'saving':
				this.renderReview(root);
				break;
			case 'done':
				this.renderDone(root);
				break;
		}
	}

	private renderDone(root: HTMLElement): void {
		const report = this.report;
		if (report === null) return;
		const createdCount = report.saved.length + report.notIndexed.length;

		root.createEl('h3', { text: createdCount > 0 ? DONE.savedHeading(createdCount) : DONE.nothingSaved });

		if (createdCount > 0) {
			const list = root.createEl('ul', { cls: 'phrasevault-saved-list' });
			for (const entry of [...report.saved, ...report.notIndexed]) {
				const item = list.createEl('li');
				const link = item.createEl('a', { text: `${formatNumber(entry.number)} — ${entry.phrase}`, href: '#' });
				link.addEventListener('click', (event) => {
					event.preventDefault();
					void this.openPath(entry.path);
				});
			}
		}

		if (report.indexCreated) root.createDiv({ cls: 'phrasevault-message phrasevault-message-info', text: DONE.indexCreated });
		if (report.notIndexed.length > 0) {
			const ids = report.notIndexed.map((entry) => formatNumber(entry.number)).join(', ');
			root.createDiv({ cls: 'phrasevault-message phrasevault-message-error', text: DONE.notIndexed(ids) });
		}
		if (report.failure !== null) {
			const box = root.createDiv({ cls: 'phrasevault-message phrasevault-message-error', attr: { role: 'alert' } });
			box.createDiv({ text: DONE.failure[report.failure.reason] });
			if (report.notAttempted > 0) box.createDiv({ text: DONE.notAttempted(report.notAttempted) });
			if (report.failure.detail !== '') box.createDiv({ cls: 'phrasevault-detail', text: report.failure.detail });
		}

		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		if (report.notIndexed.length > 0 || report.indexCreated) {
			new ButtonComponent(actions).setButtonText(DONE.repairIndex).onClick(() => void this.plugin.repairIndex());
		}
		if (this.cards.length > 0) {
			new ButtonComponent(actions).setButtonText(DONE.retryRemaining(this.cards.length)).onClick(() => this.retryRemaining());
		}
		new ButtonComponent(actions).setButtonText(DONE.openIndex).onClick(() => void this.openPath(INDEX_PATH));
		new ButtonComponent(actions).setButtonText(UI.newImage).onClick(() => this.discardThen(() => this.resetToEmpty()));
		new ButtonComponent(actions)
			.setButtonText(UI.close)
			.setCta()
			.onClick(() => this.close());
	}

	private renderMessage(root: HTMLElement): void {
		if (this.message === null) return;
		root.createDiv({
			cls: ['phrasevault-message', `phrasevault-message-${this.message.kind}`],
			text: this.message.text,
			attr: { role: this.message.kind === 'error' ? 'alert' : 'status' },
		});
	}

	private renderImage(root: HTMLElement, image: ImportedImage, compact = false): void {
		const frame = root.createDiv({ cls: ['phrasevault-preview', compact ? 'is-compact' : 'is-full'] });
		if (this.previewUrl !== null) frame.createEl('img', { attr: { src: this.previewUrl, alt: 'Ekran görüntüsü önizlemesi' } });
		root.createDiv({
			cls: 'phrasevault-meta',
			text: UI.imageMeta(image.width, image.height, image.format.toUpperCase(), formatBytes(image.byteLength)),
		});
	}

	private renderNextNumber(root: HTMLElement): void {
		const el = root.createDiv({ cls: 'phrasevault-next-number' });
		void this.plugin.store.peekNextNumber().then(
			(n) => el.setText(UI.nextNumber(formatNumber(n))),
			() => el.remove(),
		);
	}

	private renderEmpty(root: HTMLElement): void {
		const drop = root.createDiv({ cls: 'phrasevault-empty' });
		drop.createEl('p', { cls: 'phrasevault-empty-hint', text: UI.emptyHint });
		drop.createEl('p', { cls: 'phrasevault-empty-subhint', text: UI.emptySubHint });
		this.renderMessage(root);
		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.pasteFromClipboard).setCta().onClick(() => void this.importFromClipboard());
		new ButtonComponent(actions).setButtonText(UI.chooseFile).onClick(() => void this.importFromFile());
	}

	private renderPreview(root: HTMLElement): void {
		const image = this.image;
		if (image === null) return this.renderEmpty(root);
		this.renderImage(root, image);
		this.renderMessage(root);
		root.createEl('p', { cls: 'phrasevault-privacy', text: UI.privacy });

		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.changeImage).onClick(() => this.resetToEmpty());
		new ButtonComponent(actions).setButtonText(REVIEW.addManual).onClick(() => this.startManualEntry());
		if (__DEV__) new ButtonComponent(actions).setButtonText(SAMPLE_UI.button).onClick(() => this.runSampleAnalysis());
		const hasCache = this.plugin.getCachedAnalysis(image.hash) !== undefined;
		if (hasCache) new ButtonComponent(actions).setButtonText(UI.analyzeAgain).onClick(() => void this.analyze({ force: true }));
		new ButtonComponent(actions)
			.setButtonText(hasCache ? UI.useCachedAnalysis : UI.analyze)
			.setCta()
			.onClick(() => void this.analyze({ force: false }));
		this.renderNextNumber(root);
	}

	private renderAnalyzing(root: HTMLElement): void {
		if (this.image !== null) this.renderImage(root, this.image);
		const status = root.createDiv({ cls: 'phrasevault-analyzing', attr: { role: 'status' } });
		status.createDiv({ cls: 'phrasevault-spinner', attr: { 'aria-hidden': 'true' } });
		status.createSpan({ text: UI.analyzing });
		const actions = root.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.cancel).onClick(() => this.cancelAnalysis());
	}

	private renderReview(root: HTMLElement): void {
		if (this.image !== null) this.renderImage(root, this.image, true);
		this.renderMessage(root);

		const analysis = this.analysis;
		root.createEl('h3', { cls: 'phrasevault-review-heading', text: REVIEW.heading(this.cards.length) });
		if (analysis === null) root.createEl('p', { cls: 'phrasevault-review-status', text: REVIEW.manualOnly });
		else {
			root.createEl('p', { cls: 'phrasevault-review-status', text: REVIEW.status[analysis.status] });
			if (analysis.suggestions.length === 0) root.createEl('p', { cls: 'phrasevault-review-status', text: REVIEW.noSuggestions });
		}
		if (this.origin !== null) renderCostSummary(root, this.origin.usage, { reused: this.origin.reused, log: this.plugin.settings.usage });

		const list = root.createDiv({ cls: 'phrasevault-cards' });
		this.cardViews.clear();
		for (const card of this.cards) {
			const view = new SuggestionCard(list, card, {
				onChange: () => {
					this.setReviewMessage(null);
					this.refreshReview();
				},
				onRemove: (removed) => this.removeCard(removed),
			});
			this.cardViews.set(card.id, view);
		}

		const addRow = root.createDiv({ cls: 'phrasevault-actions is-start' });
		new ButtonComponent(addRow).setButtonText(REVIEW.addManual).onClick(() => this.addManualCard());

		this.reviewMessageEl = root.createDiv();
		const footer = root.createDiv({ cls: 'phrasevault-footer' });
		this.renderNextNumber(footer);
		const actions = footer.createDiv({ cls: 'phrasevault-actions' });
		new ButtonComponent(actions).setButtonText(UI.backToPreview).onClick(() => this.discardThen(() => this.backToPreview()));
		this.saveButton = new ButtonComponent(actions).setCta().onClick(() => void this.save());

		const saving = this.phase === 'saving';
		if (saving) for (const view of this.cardViews.values()) view.setDisabled(true);
		this.refreshReview();
	}
}
