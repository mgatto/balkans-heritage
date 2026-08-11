import html from './footer.html?inline';
import styles from './footer.css?inline';

class Footer extends HTMLElement {
    constructor() {
        super();

        const shadowRoot = this.attachShadow({mode: 'open'});
        const footer = document.createElement('footer');

        footer.innerHTML = Footer.template;
        shadowRoot.appendChild(footer);
    }

    connectedCallback() {
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
