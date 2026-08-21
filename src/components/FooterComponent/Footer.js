import html from './footer.html?inline';
import styles from './footer.css?inline';
// Imported (rather than referenced as a string in footer.html) so Vite fingerprints
// these files and includes them in the build output; footer.html is only ever loaded
// as a raw string via `?inline`, so Vite never sees its <img> src attributes and can't
// rewrite or emit them on its own.
import ccLogoSrc from '../../assets/img/CC.png';
import humansLogoSrc from '../../assets/img/humanstxt-isolated-blank.gif';

class Footer extends HTMLElement {
    constructor() {
        super();

        // footer.html already provides the semantic <footer> (contentinfo landmark), so the
        // template is rendered straight into the shadow root. Wrapping it in a second
        // document.createElement('footer') previously produced a <footer> nested in a
        // <footer> — two contentinfo landmarks — which axe flags as duplicate, non-top-level,
        // and non-unique (see docs/accessibility.md).
        this.attachShadow({mode: 'open'});
        this.shadowRoot.innerHTML = Footer.template;
    }

    connectedCallback() {
        const yearEl = this.shadowRoot.querySelector('.year');
        if (yearEl) {
            yearEl.textContent = new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                era: 'short',
            }).format(new Date());
        }

        const ccLogoEl = this.shadowRoot.querySelector('.cc-logo');
        if (ccLogoEl) {
            ccLogoEl.src = ccLogoSrc;
        }

        const humansLogoEl = this.shadowRoot.querySelector('.humanstxt-logo');
        if (humansLogoEl) {
            humansLogoEl.src = humansLogoSrc;
        }
    }

    static get template() {
        return `
            <style>
              ${styles}
            </style>
            ${html}  
        `;
    }
}

if (!customElements.get('balkans-footer')) {
    customElements.define('balkans-footer', Footer);
}
