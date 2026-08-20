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

    render() {
        const shadowRoot = this.attachShadow({ mode: "open" });
        const container = document.createElement("div");

        container.innerHTML = this.template;
        shadowRoot.appendChild(container);

        const currentPage = this.currentPage;
        if (!currentPage) return;

        if (currentPage.nav) {
            // The current page is itself a top-level bar item (Home or a Part hub): dim it
            // and take it out of the tab order — you're already here.
            this.markActive(shadowRoot, `${currentPage.name}_link`, "active", "page");
        } else if (currentPage.part) {
            // A landmark page isn't in the primary bar, so highlight its parent Part hub as
            // the current section (kept clickable, a way back up)…
            this.markActive(shadowRoot, `${currentPage.part}_link`, "current-section", "true");
            // …and dim its own entry in the section sub-bar — you're already here.
            this.markActive(shadowRoot, `${currentPage.name}_sublink`, "active", "page");
        }
    }

    markActive(shadowRoot, id, className, ariaCurrent) {
        const li = shadowRoot.getElementById(id);
        if (!li) return;
        li.classList.add(className);
        const link = li.querySelector("a");
        if (link) link.setAttribute("aria-current", ariaCurrent);
    }

    // The page registry, injected at build/dev time from vite.config.js's `pages` array
    // (via Vite's `define`), so this nav stays in lock-step with pagination, breadcrumbs,
    // and the SEO files instead of a hand-maintained hardcoded list. Entries flagged `nav`
    // (Home + each Part hub) form the primary bar; the rest (landmark pages) form each
    // section's sub-bar.
    static get pages() {
        return __NAV_PAGES__;
    }

    // The registry entry for the page currently being viewed, or null if it isn't in the
    // registry (matched on normalized path so extensionless/.html/trailing-slash forms agree).
    get currentPage() {
        const current = Navigation.normalizePath(window.location.pathname);
        return (
            Navigation.pages.find(
                (page) => Navigation.normalizePath(page.route) === current
            ) ?? null
        );
    }

    // The landmark pages of the current page's Part (its section sub-bar). Empty on Home and
    // anywhere without a `part`, so the sub-bar only appears inside a section.
    get sectionLandmarks() {
        const page = this.currentPage;
        if (!page || !page.part) return [];
        return Navigation.pages.filter((p) => p.part === page.part && !p.nav);
    }

    // Normalize a URL path so extensionless (`/ottoman/bridge`), `.html`
    // (`/ottoman/bridge.html`), directory-index (`/ottoman/`, `/ottoman/index.html`), and
    // root (`/`) forms all compare equal to the registry's `route` values.
    static normalizePath(path) {
        let p = path.replace(/index\.html$/, "").replace(/\.html$/, "");
        if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
        return p || "/";
    }

    get template() {
        const listItems = (pages, idSuffix) =>
            pages
                .map(
                    (page) => `
                <li id="${page.name}_${idSuffix}">
                    <a href="${page.route}">${page.navLabel ?? page.title}</a>
                </li>`
                )
                .join("");

        const primaryItems = listItems(
            Navigation.pages.filter((page) => page.nav),
            "link"
        );

        // Second-tier bar: only rendered inside a section, listing that section's landmarks.
        const landmarks = this.sectionLandmarks;
        let subnav = "";
        if (landmarks.length) {
            const hub = Navigation.pages.find((p) => p.name === this.currentPage.part);
            const sectionLabel = hub ? hub.navLabel ?? hub.title : "Section";
            subnav = `
            <nav class="subnav" aria-label="${sectionLabel} section">
                <ol>${listItems(landmarks, "sublink")}
                </ol>
            </nav>`;
        }

        return `
            <style>
                nav {
                    color: #fff;
                    background-color: #333;
                }
                
                /* Second tier reads as subordinate: a lighter band and smaller type. */
                nav.subnav {
                    background-color: #555;
                }
                
                nav ol {
                    display: flex;
                    justify-content: space-evenly;
                    width: 100%;
                    margin: 0;
                    padding: 0;
                }
                
                /* Primary (top-most) bar is left-aligned; the section sub-bar keeps its
                   evenly-distributed layout. */
                nav.primary ol {
                    justify-content: flex-start;
                    gap: 1.5rem;
                }
                
                nav li {
                    list-style-type: none;
                    display: block;
                    flex: 0 1 auto;
                    background-color: #333;
                    padding: 1rem 0;
                    z-index: 1;
                }
                
                nav.subnav li {
                    background-color: #555;
                    padding: 0.6rem 0;
                    font-size: 0.9rem;
                }
                
                nav li:first-child {
                    padding-left: 1rem;
                }
                
                nav li:last-child {
                    padding-right: 1rem;
                }
                
                nav a {
                    color: #fff;
                    letter-spacing: 0.08em;
                    text-underline-offset: 0.25em;
                }
                
                nav li.active {
                    filter: opacity(0.2);
                    pointer-events:none;
                }
                
                nav li.active > a {
                    text-decoration: none;
                }
                
                /* Parent section of the current landmark page: highlighted but still
                   clickable (a way back up to the Part hub), unlike the dimmed current page.
                   (Underline offset is shared with all nav links via the nav a rule above.) */
                nav li.current-section > a {
                    text-decoration: underline;
                }
            </style>
            
            <nav class="primary" aria-label="Primary">
                <ol>${primaryItems}
                </ol>
            </nav>${subnav}
        `;
    }
}

if (!customElements.get("balkans-navigation")) {
    customElements.define("balkans-navigation", Navigation);
}
