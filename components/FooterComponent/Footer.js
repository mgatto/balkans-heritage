class Footer extends HTMLElement {
    constructor() {
        super();

        const shadowRoot = this.attachShadow({mode: 'open'});
        const footer = document.createElement('footer');

        footer.innerHTML = Footer.template;

        shadowRoot.appendChild(footer);
    }

    connectedCallback() {}

    static get template() {
        return `
            <style>
                :host { display: grid; text-align: center; margin: 5rem auto 2rem auto; transform: scale(0.7);}
                :host > footer { margin: 5rem auto 2rem auto; }
                .year { font-weight: bold; font-size: larger; display: block; line-height: 2rem; }
                .license { display: block; font-style: italic; font-weight: lighter; margin-top: 1rem; }
                :host hr {
                    border: none;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                    margin-top: -1px;
                } 
            </style>
            
            <footer>
                <div>
                    <hr>
                </div>
                
                <div class="footer-primary"> <!--new Intl.Locale('en-Arab-US', {numberingSystem: 'arabext', calendar: 'islamic'})-->
                    <span class="year">${new Intl.DateTimeFormat('en-US', {year : 'numeric', era: 'short'}).format(new Date())}</span>
                    <span class="year" style="direction: rtl">${new Intl.DateTimeFormat('ar-SA', {year : 'numeric', era: 'short'}).format(new Date())}</span> 

                    <img src="assets/img/CC.png" alt="Logo for the Creative Commons License">
                    <span class="license">This work is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.</span>
                </div>
                <div>
                    <a href="humans.txt">
                        <img src="assets/img/humanstxt-isolated-blank.gif" alt="the humans.txt logo">
                    </a> 
                </div>
            </footer>
        `;
    }
}

if ( !customElements.get('balkans-footer')) {
    customElements.define('balkans-footer', Footer);
}
