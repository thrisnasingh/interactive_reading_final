// Create the right pane for figures
function createFigurePane() {
    if (document.getElementById('figure-pane')) {
        console.log('Figure pane already exists');
        return;
    }

    const figurePane = document.createElement('div');
    figurePane.id = 'figure-pane';
    figurePane.style.cssText = `
        position: fixed;
        right: 0;
        top: 0;
        width: 40%;
        height: 100vh;
        overflow-y: auto;
        background: white;
        padding: 20px;
        box-shadow: -2px 0 5px rgba(0,0,0,0.1);
        z-index: 1000;
    `;
    document.body.appendChild(figurePane);
    console.log('Figure pane created');
}

// Load and process content.json
async function loadContent() {
    try {
        const response = await fetch('content.json');
        const content = await response.json();
        console.log('Content loaded successfully');
        return content;
    } catch (error) {
        console.error('Error loading content.json:', error);
        return null;
    }
}

// Main class to handle the interactive reading
class InteractiveReader {
    constructor() {
        this.content = null;
        this.sentenceToVisualMap = new Map();
        this.leftPane = null;
        this.rightPane = null;
       this.currentHighlight = null;
    }

    async initialize() {
        // Load content
        this.content = await this.loadContent();
        if (!this.content) {
            console.error('Failed to load content');
            return;
        }

        // Remove loading message
        const loading = document.querySelector('.loading');
        if (loading) loading.remove();

        // Create two-pane layout
        this.createPaneLayout();
        
        // Generate HTML content from JSON
        this.generateContent();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial update of visuals
        this.updateVisuals();
    }

    createPaneLayout() {
        // Create left pane (content)
        this.leftPane = document.createElement('div');
        this.leftPane.id = 'content-pane';
        this.leftPane.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 60%;
            height: 100vh;
            overflow-y: auto;
            padding: 20px;
        `;
        
        // Create right pane (visuals)
        this.rightPane = document.createElement('div');
        this.rightPane.id = 'visual-pane';
        this.rightPane.style.cssText = `
            position: fixed;
            right: 0;
            top: 0;
            width: 40%;
            height: 100vh;
            overflow-y: auto;
            padding: 20px;
            background: white;
            box-shadow: -2px 0 5px rgba(0,0,0,0.1);
        `;

        document.body.appendChild(this.leftPane);
        document.body.appendChild(this.rightPane);
    }

    generateContent() {
        const article = document.createElement('article');
        
        // Add title
        const title = document.createElement('h1');
        title.textContent = this.content.title;
        article.appendChild(title);

        // Add authors
        const authors = document.createElement('div');
        authors.className = 'authors';
        this.content.authors.forEach(author => {
            const authorDiv = document.createElement('div');
            authorDiv.className = 'author';
            authorDiv.textContent = `${author.name}, ${author.affiliation}`;
            authors.appendChild(authorDiv);
        });
        article.appendChild(authors);

        // Generate abstract
        if (this.content.abstract) {
            const abstractSection = this.generateSection(this.content.abstract, true);
            article.appendChild(abstractSection);
        }

        // Generate sections
        if (this.content.body && this.content.body.sections) {
            this.content.body.sections.forEach(section => {
                const sectionElem = this.generateSection(section);
                article.appendChild(sectionElem);
            });
        }

        this.leftPane.appendChild(article);
    }

    generateSection(section, isAbstract = false) {
        const sectionElem = document.createElement('section');
        sectionElem.id = section.id || 'abstract';
        sectionElem.className = isAbstract ? 'abstract' : '';

        const title = document.createElement('h2');
        title.textContent = isAbstract ? 'Abstract' : section.title;
        sectionElem.appendChild(title);

        const sentences = isAbstract ? section.sentences : 
            section.paragraphs.flatMap(p => p.sentences);

        sentences.forEach(sentence => {
            const sentenceSpan = this.createSentenceSpan(sentence, section.id);
            const container = document.createElement('p');
            container.appendChild(sentenceSpan);
            container.appendChild(document.createTextNode(' '));
            sectionElem.appendChild(container);
        });

        return sectionElem;
    }

    createSentenceSpan(sentence, sectionId) {
        const sentenceSpan = document.createElement('span');
        sentenceSpan.textContent = sentence.text;
        sentenceSpan.className = 'sentence';
        sentenceSpan.dataset.sectionId = sectionId;
        sentenceSpan.dataset.sentenceId = sentence.id;
        
        // Debug logging for visual mapping
        if (sentence.associated_visual) {
            console.log('Found sentence with visual:', {
                text: sentence.text.substring(0, 50) + '...',
                id: sentence.id,
                visual: sentence.associated_visual
            });
            this.sentenceToVisualMap.set(sentence.id, sentence.associated_visual);
            sentenceSpan.dataset.hasVisual = 'true';
            sentenceSpan.style.color = '#2962FF'; // Make visually linked sentences more obvious
            sentenceSpan.style.cursor = 'pointer';
        }
        
        // Add click handler directly to the span
        sentenceSpan.addEventListener('click', () => {
            if (sentence.associated_visual) {
                console.log('Clicked sentence:', {
                    text: sentence.text.substring(0, 50) + '...',
                    visual: sentence.associated_visual
                });
                this.showVisual(sentence.associated_visual);
            }
        });

        return sentenceSpan;
    }

    setupEventListeners() {
        // Scroll listener for updating visuals
        this.leftPane.addEventListener('scroll', () => {
            requestAnimationFrame(() => this.updateVisuals());
        });

        // Click listener for sentences
        this.leftPane.addEventListener('click', (e) => {
            const sentence = e.target.closest('.sentence[data-has-visual="true"]');
            if (sentence) {
                this.handleSentenceClick(sentence);
            }
        });
    }

    handleSentenceClick(sentence) {
        // Remove previous highlight
        if (this.currentHighlight) {
            this.currentHighlight.classList.remove('highlight');
        }

        // Add new highlight
        sentence.classList.add('highlight');
        this.currentHighlight = sentence;

        // Show associated visual
        const visualId = this.sentenceToVisualMap.get(sentence.dataset.sentenceId);
        if (visualId) {
            this.showVisual(visualId);
        }
    }

    showVisual(visualId) {
        console.log('Attempting to show visual:', visualId);
        // Clear right pane
        this.rightPane.innerHTML = '';

        // Find the visual element
        const element = document.querySelector(`#${visualId}`);
        console.log('Found element:', element);
        
        if (element) {
            const clone = element.cloneNode(true);
            clone.style.display = 'block';
            this.rightPane.appendChild(clone);
            console.log('Added visual to right pane');
        } else {
            console.warn('Visual element not found:', visualId);
            // Log all available figures for debugging
            const allFigures = document.querySelectorAll('figure');
            console.log('Available figures:', Array.from(allFigures).map(fig => ({
                id: fig.id,
                innerHTML: fig.innerHTML.substring(0, 100) + '...'
            })));
        }
    }

    updateVisuals() {
        const visibleSentences = this.getVisibleSentences();
        console.log('Visible sentences:', visibleSentences);
        
        const visuals = new Set();
        visibleSentences.forEach(sentenceId => {
            const visualId = this.sentenceToVisualMap.get(sentenceId);
            if (visualId) {
                console.log('Found visual for sentence:', {
                    sentenceId,
                    visualId
                });
                visuals.add(visualId);
            }
        });

        this.showVisuals(Array.from(visuals));
    }

    getVisibleSentences() {
        const visibleSentences = new Set();
        const viewportTop = this.leftPane.scrollTop;
        const viewportBottom = viewportTop + this.leftPane.clientHeight;

        this.leftPane.querySelectorAll('.sentence[data-has-visual="true"]').forEach(sentence => {
            const rect = sentence.getBoundingClientRect();
            if (rect.top < viewportBottom && rect.bottom > 0) {
                console.log('Found visible sentence:', {
                    text: sentence.textContent.substring(0, 50) + '...',
                    id: sentence.dataset.sentenceId,
                    visual: this.sentenceToVisualMap.get(sentence.dataset.sentenceId)
                });
                visibleSentences.add(sentence.dataset.sentenceId);
            }
        });

        return visibleSentences;
    }

    showVisuals(visualIds) {
        this.rightPane.innerHTML = '';
        visualIds.forEach(visualId => {
            const element = document.querySelector(`#${visualId}`);
            if (element) {
                const clone = element.cloneNode(true);
                clone.style.display = 'block';
                this.rightPane.appendChild(clone);
            }
        });
    }

    async loadContent() {
        try {
            const response = await fetch('content.json');
            return await response.json();
        } catch (error) {
            console.error('Error loading content.json:', error);
            return null;
        }
    }
}

// Initialize on page load
window.addEventListener('load', async () => {
    const reader = new InteractiveReader();
    await reader.initialize();
}); 