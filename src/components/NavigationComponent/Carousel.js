class Carousel extends HTMLElement {
    constructor() {
        super();

        const shadowRoot = this.attachShadow({mode: 'open'});

        this.carousel = document.createElement('div');
        this.carousel.setAttribute('id', 'content-carousel')
        this.carousel.innerHTML = Carousel.template;

        shadowRoot.appendChild(this.carousel);
    }

    connectedCallback() {
        this.items = this.shadowRoot.querySelectorAll('slot');  // must be 'All' to get, er all of the slots
        this.slide = 0;

        this.shadowRoot.querySelector('.next').addEventListener('click', () => {
            // which slot to show next? do a mod of the items' length
            const newIndex = this.slide++;
            this.moveSlide(newIndex);
        });

        this.shadowRoot.querySelector('.previous').addEventListener('click', () => {
            const newIndex = this.slide--;
            this.moveSlide(newIndex);
        });

        this.shadowRoot.querySelector('slot[name="start"]').classList.add("active");
        this.shadowRoot.querySelector('slot[name="middle"]').classList.add("next");
        this.shadowRoot.querySelector('slot[name="end"]').classList.add("previous");

        // simple autoscrolling, every 4 seconds
        setInterval(() => {
            const newIndex = this.slide++;
            this.moveSlide(newIndex);
        }, 4000);
    }

    moveSlide(slideIndex) {
        let n = this.items.length;

        // use the modulo operator to wrap around the items array with modular arithmetic
        let previousIndex = (this.slide - 1 % n + n) % n;
        let currentIndex = (this.slide % n + n) % n;
        let nextIndex = (this.slide + 1 % n + n) % n;

        this.items[previousIndex].className = 'previous';
        this.items[currentIndex].className = 'active';
        this.items[nextIndex].className = 'next';
    }

    static get template() {
        return `
            <style>
                :host { overflow: hidden; width: 90%;}
                :host * { box-sizing: border-box; }
                #content-carousel {transform-style: preserve-3d;border: 1px solid rgba(0, 0, 0, 0.1); width:70%; margin: 0 auto;padding:1rem;}
                ::slotted(img) {  
                    opacity: 0;
                    position: absolute;
                    top:0;
                    width: 100%;
                    margin: auto;
                    padding: 1rem 4rem;
                    z-index: 100;
                    transition: transform .5s, z-index .5s;
                }
                slot.active::slotted(img) {
                    opacity: 1;
                    position: relative;
                    z-index: 900;
                }
                slot.previous::slotted(img), slot.next::slotted(img) {
                  z-index: 800;
                }
                slot.previous::slotted(img) {
                  transform: translateX(-100%);
                }
                slot.next::slotted(img) {
                  transform: translateX(100%);
                }
                :host .go {
                  position: absolute;
                  top:50%;
                  width: 3rem;
                  height: 3rem;
                  background-color: #FFF;
                  transform: translateY(-50%);
                  border-radius: 50%;
                  cursor: pointer; 
                  z-index: 1001;
                  border: 1px solid black;
                }
                :host .previous { left:0; }
                :host .next { right:0; }
                
                :host .previous::after,
                :host .next::after {
                  content: " ";
                  position: absolute;
                  width: 10px;
                  height: 10px;
                  top: 50%;
                  left: 54%;
                  border-right: 2px solid black;
                  border-bottom: 2px solid black;
                  transform: translate(-50%, -50%) rotate(135deg);
                }
                :host .next::after {
                  left: 47%;
                  transform: translate(-50%, -50%) rotate(-45deg);
                }
            </style>
            
            <h3>Previews</h3>
            
            <div class="go previous"></div>
            <slot name="start"></slot>
            <slot name="middle"></slot>
            <slot name="end"></slot>
            <div class="go next"></div>
        `;
    }
}

if ( !customElements.get('balkans-carousel')) {
    customElements.define('balkans-carousel', Carousel);
}
