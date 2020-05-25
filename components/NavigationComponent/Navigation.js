class Navigation extends HTMLElement {
    /*
    * all svg sourced from Wikipedia / Wikimedia and is used under the Creative Commons license
    */

    constructor() {
        super();
    }

    connectedCallback() {
        this.render();
    }


    set page(name) {
        this._page = name;
    }

    get page() {
        return this._page;
    }

    render() {
        this.page = this.getAttribute('page');

        const shadowRoot = this.attachShadow({mode: 'open'});
        const nav = document.createElement('nav');

        nav.innerHTML = this.template;
        shadowRoot.appendChild(nav);

        let filename = window.location.pathname.split('/').pop().split('.')[0] || '';
        if (filename === '' || filename === 'index') {
            filename = 'home';
        }

        const currentNavLI = shadowRoot.getElementById(`${filename}_link`);
        currentNavLI.classList.add('active');
    }

    get template() {
        return `
            <style>
                nav {
                    color: #fff;
                    background-color: #333;
                }
                
                nav ol {
                    display: flex;
                    justify-content: space-evenly;
                    width: 100%;
                    margin: 0;
                    padding: 0;
                }
                
                nav li {
                    list-style-type: none;
                    display: block;
                    flex: 0 1 auto;
                    background-color: #333;
                    padding: 1rem 0;
                    z-index: 1;
                }
                
                nav li:first-child {
                    padding-left: 1rem;
                }
                
                nav li:last-child {
                    padding-right: 1rem;
                }
                
                nav a {
                    color: #fff;
                }
                
                nav li.active {
                    filter: opacity(0.2);
                    pointer-events:none;
                }
                
                nav li.active > a {
                    text-decoration: none;
                }
            </style>
            
            <ol>
                <li id="home_link">
                    <a href="index.html">Home</a>
                </li>
                
                <li id="fountain_link">
                    <a href="fountain.html">Fountain</a>
                </li>
                
                <li id="monastery_link">
                    <a href="monastery.html">Monastery</a>
                </li>
                
                <li id="bridge_link">
                    <a href="bridge.html">Bridge</a>
                </li>
            </ol>
        `;
    }
}

if ( !customElements.get('balkans-navigation')) {
    customElements.define('balkans-navigation', Navigation);
}
