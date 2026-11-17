import type { ButtonComponent } from 'obsidian';

/**
 * Styles a button as destructive. setDestructive() exists from Obsidian 1.13;
 * on older versions the same look comes from the "mod-warning" class.
 */
export function makeDestructive(button: ButtonComponent): ButtonComponent {
	if ('setDestructive' in button && typeof button.setDestructive === 'function') return button.setDestructive();
	button.buttonEl.addClass('mod-warning');
	return button;
}
