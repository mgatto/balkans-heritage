// Progressive enhancement for the per-landmark Ottoman vocabulary glossary.
// The <details> glossary and the native Popover API invokers both work with no
// JS. This module only layers on three things:
//   1. the iOS/iPadOS light-dismiss workaround (WebKit bug 267688),
//   2. opening the <details> when a #glossary-* fragment is the navigation
//      target (so the popover "Full entry" link and external deep-links reveal
//      the entry instead of scrolling to a collapsed panel), and
//   3. on browsers without the Popover API, rewriting the otherwise-inert
//      invoker buttons into anchors that jump to the matching glossary entry.
// See docs/future/ottoman-vocabulary-glossary.md.

const POPOVER_SUPPORTED =
    typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;

// (1) WebKit bug 267688: on iOS/iPadOS Safari < 18.3, popover light-dismiss
// (tap outside to close) only activates once the document has at least one
// pointerdown listener. A passive no-op is enough, and is harmless on fixed
// versions. https://webkit.org/b/267688
document.addEventListener(
    "pointerdown",
    () => {
        /* no-op: the listener's mere presence is the fix */
    },
    { passive: true }
);

// (2) Reveal a glossary entry when its fragment is the navigation target.
function openGlossaryForHash() {
    const { hash } = window.location;
    if (!hash.startsWith("#glossary-")) return;
    const entry = document.getElementById(hash.slice(1));
    if (!entry) return;
    const details = entry.closest("details.glossary");
    if (details) details.open = true;
    entry.scrollIntoView({ block: "center" });
}

window.addEventListener("hashchange", openGlossaryForHash);
openGlossaryForHash();

// Close the popover when its "Full entry" link is followed, so it doesn't
// linger over the page while the glossary scrolls into view.
if (POPOVER_SUPPORTED) {
    document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const link = event.target.closest(".glossary-popover-more");
        if (!link) return;
        const panel = link.closest("[popover]");
        if (panel) panel.hidePopover();
    });
}

// (3) Without the Popover API the invoker buttons do nothing, so rewrite each
// into an anchor pointing at the matching glossary entry (popover-<slug> ->
// glossary-<slug>); openGlossaryForHash then opens the <details> on click.
if (!POPOVER_SUPPORTED) {
    document.querySelectorAll("button[popovertarget]").forEach((button) => {
        const targetId = button.getAttribute("popovertarget");
        if (!targetId) return;
        const anchor = document.createElement("a");
        anchor.href = "#" + targetId.replace(/^popover-/, "glossary-");
        anchor.className = button.className;
        anchor.textContent = button.textContent.trim();
        const label = button.getAttribute("aria-label");
        if (label) anchor.setAttribute("aria-label", label);
        button.replaceWith(anchor);
    });
}
