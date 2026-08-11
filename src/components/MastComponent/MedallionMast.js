class MedallionMast extends HTMLElement {
    /*
    * all svg sourced from Wikipedia / Wikimedia and is used under the Creative Commons license
    */

    constructor() {
        super();
    }

    connectedCallback() {
        this.render();
    }

    set country(name) {
        this._country = name;
    }

    get country() {
        return this._country;
    }

    render() {
        this.country = this.getAttribute('country');

        const shadowRoot = this.attachShadow({mode: 'open'});
        const mast = document.createElement('div');

        mast.innerHTML = this.template;
        shadowRoot.appendChild(mast);
    }

    get template() {
        const config = {
            balkans: {
                colors: ['#E30A17','#fff','#E30A17'],
                medallionImage: 'star_and_crescent.svg'
            },
            albania: {
                colors: ['#ed1c24','#cfa550','#1d3c85'], // consider modern rgb or hsl
                medallionImage: 'albanian_eagle.svg'
            },
            bosnia: {
                colors: ['#eec900','#fff','#003e9e'],
                medallionImage: 'bosnian_coat_of_arms.svg'
            }
        };


        return `
            <style>
                #medallion {
                    width: 100%;
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                    justify-content: center;
                }
                
                #medallion img {
                    height: 40px;
                    position: absolute;
                    top: 3.5rem;
                }
            </style>
            
            <svg id="" width="100%" height="30px">
                <defs>
                    <lineargradient id="first-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:${config[this.country].colors[0]};stop-opacity:1" />
                    </lineargradient>

                    <lineargradient id="second-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:${config[this.country].colors[1]};stop-opacity:1" />
                    </lineargradient>
                    
                    <lineargradient id="third-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:${config[this.country].colors[2]};stop-opacity:1" />
                    </lineargradient>
                </defs>

                <rect x="0" y="0" width="100%" height="10px" fill="url(#first-gradient)" />
                <rect x="0" y="10" width="100%" height="10px" fill="url(#second-gradient)" />
                <rect x="0" y="20" width="100%" height="10px" fill="url(#third-gradient)" />
            </svg>

            <div id="medallion" class="row">
                <img src="assets/img/${config[this.country].medallionImage}" alt="">
            </div>
        `;
    }
}

if ( !customElements.get('balkans-mast')) {
    customElements.define('balkans-mast', MedallionMast);
}
