/**
 * Puts a line of text on the clipboard, in all three webviews and every browser.
 *
 * The async Clipboard API is the first choice and works in WebView2, WKWebView
 * and Chromium. WebKitGTK builds without it, and a page served over plain http
 * never gets it, so the old copy-from-a-selection trick stands behind it. Both
 * have to be started by the click itself, which is why callers invoke this
 * straight from the handler rather than after anything else they await.
 */
export async function copyText(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// Refused or unsupported here: the selection route below still may not be.
		}
	}

	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	// Off-screen rather than hidden: a hidden element has no selection to copy.
	area.style.position = 'fixed';
	area.style.top = '-100px';
	area.style.opacity = '0';
	document.body.append(area);
	area.select();
	try {
		if (!document.execCommand('copy')) throw new Error('The clipboard refused the copy.');
	} finally {
		area.remove();
	}
}
