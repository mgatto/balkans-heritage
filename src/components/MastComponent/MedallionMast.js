// Imported (rather than referenced as a filename string below) so Vite fingerprints
// these files and includes them in the build output; a plain string in a template
// literal is invisible to Vite's asset pipeline and would 404 once built.
import starAndCrescent from '../../assets/img/star_and_crescent.svg';
import albanianEagle from '../../assets/img/albanian_eagle.svg';
import bosnianCoatOfArms from '../../assets/img/bosnian_coat_of_arms.svg';
// Imported via `?inline` (rather than a hardcoded string in the template) so the styles
// are bundled into the shadow root and — unlike an inline `<style>` string — go through
// Stylelint (npm run lint:css) and Vite's Lightning CSS pipeline. Mirrors the Footer and
// Navigation components.
import styles from './mast.css?inline';

class MedallionMast extends HTMLElement {
    /*
    * all svg sourced from Wikipedia / Wikimedia and is used under the Creative Commons license
    */

    constructor() {
        super();
        this.attachShadow({mode: 'open'});
    }

    connectedCallback() {
        this.country = this.getAttribute('country');
        this.parts = this.hasAttribute('parts');

        this.shadowRoot.innerHTML = this.template;
    }

    set country(name) {
        this._country = name;
    }

    get country() {
        return this._country;
    }

    // One signature color per Part, in chronological (Part I → IV) order — the same order
    // as the Parts grid on the home page, so the mast reads as a legend for it. Byzantine
    // is imperial "born in the purple" Tyrian purple; the rest are the era's conventional
    // colors (Ottoman green, Habsburg gold, socialist red). Used only by the home page's
    // `parts` mast (<balkans-mast parts>); the per-country flag masts are unaffected.
    static get partColors() {
        return [
            '#66023c', // Part I — Byzantine: Tyrian / imperial purple
            '#007f00', // Part II — Ottoman: green
            '#FFDD11', // Part III — Habsburg: gold / yellow
            '#DE0000', // Part IV — Socialist: red
        ];
    }

    get template() {
        const config = {
            balkans: {
                colors: ['#E30A17','#fff','#E30A17'],
                medallionImage: starAndCrescent
            },
            kosovo: {
                // Prizren (the Bridge) has a large ethnic-Albanian population, so the
                // medallion deliberately uses the Albanian eagle/tricolor even though the
                // landmark is in Kosovo — the `country` label is Kosovo, the imagery is not.
                colors: ['#ed1c24','#cfa550','#1d3c85'], // consider modern rgb or hsl
                medallionImage: albanianEagle
            },
            bosnia: {
                colors: ['#eec900','#fff','#003e9e'],
                medallionImage: bosnianCoatOfArms
            }
        };

        // `parts` mode (home page): one band per Part, no single-country medallion.
        // Otherwise: the selected country's flag palette + emblem.
        const colors = this.parts ? MedallionMast.partColors : config[this.country].colors;
        const medallionImage = this.parts ? null : config[this.country].medallionImage;

        // Divide the fixed 30px-tall mast evenly across however many bands there are
        // (3 for the country flags, 4 for the Parts palette), so adding/removing a Part
        // needs no layout math here.
        const bandHeight = 30 / colors.length;
        const bands = colors
            .map(
                (color, i) =>
                    `<rect x="0" y="${i * bandHeight}" width="100%" height="${bandHeight}" fill="${color}" />`
            )
            .join('\n                ');

        return `
            <style>${styles}</style>
            
            <svg width="100%" height="30px">
                ${bands}
            </svg>
            ${medallionImage ? `
            <div id="medallion" class="row">
                <img src="${medallionImage}" alt="">
            </div>` : ''}
        `;
    }
}

if ( !customElements.get('balkans-mast')) {
    customElements.define('balkans-mast', MedallionMast);
}
