let content; // content.json
let contentMap = new Map();
// type:
// title:
// paragraphs: [
//     {
//         "full_text": "string",
//         "sentences": [{text:, associated_visual: (can be null)}]
//         "isSubsectionTitle": "boolean",
//         "level": "number"
//         "subsectionLevel:"
//         "lists: [{type: , sentences: [text:]}]" ? i think lists are outside of paragraphs in the original json
//     }
//     associated_visual: 
// ]
let currentState = 'title'; // always preload with the first state to be title
let currentSectionIndex = 0;
let currentParagraphIndex = 0;
let isScrolling = false;
let panelOpen = false;
let diagramsPanelOpen = false;
let citationsPanelOpen = false;
let titleMap = new Map();
// title:
// authors:
// pubInfo:
// keywords:
// concepts:
// referenceFormat: direct ACM text
let citationsMap = new Map();
// id: citation1
// label: [1]
// value: 1
// citation: 
let highlightsOn = false;
let darkModeOn = false;

// kinda like my main
document.addEventListener('DOMContentLoaded', function () {
    // Fetch all files concurrently
    Promise.all([
        fetch('/static/content.json'),
        fetch('/static/title.json'),
        fetch('/static/references.json')
    ])
        .then(([contentResponse, titleResponse, referencesResponse]) => 
            Promise.all([contentResponse.json(), titleResponse.json(), referencesResponse.json()])
        )
        .then(([contentData, titleData, referencesData]) => {
            // Store content globally
            content = contentData;
            
            // Process citations - might move this to another function later
            referencesData.forEach(citation => {
                citationsMap.set(citation.id, {
                    label: citation.label,
                    value: citation.value,
                    citation: citation.citation
                });
            });
            console.log('Processed', citationsMap.size, 'citations');
            
            // Process title data
            breakUpTitle(titleData);

            // Process visual elements
            visualElementsMap = processVisualElements(content);
            console.log('Visual elements:', visualElementsMap);

            breakUpContent(content);
            createNavigationBar();
            createCitationsPanel();
            createDiagramsPanel();
            
            // Initial render based on URL or default to title
            const urlParams = new URLSearchParams(window.location.search);
            const state = urlParams.get('state') || 'title';
            const section = urlParams.get('section') || '0';
            const paragraph = urlParams.get('paragraph') || '0';
            
            navigateToState(state, parseInt(section), parseInt(paragraph));
            
            // Add scroll event listener
            window.addEventListener('wheel', handleScroll);
        })
        .catch(error => console.error('Error loading content:', error));
});


// functiosn that handlle scrolling
function handleScroll(event) {
    if (panelOpen || citationsPanelOpen || diagramsPanelOpen) return;
    if (isScrolling) return;
    isScrolling = true;
    
    if (event.deltaY > 0) { // Scrolling down
        switch (currentState) {
            case 'title':
                navigateToState('abstract');
                break;
            case 'abstract':
                navigateToState('content', 0, 0);
                break;
            case 'content':
                navigateToNextParagraph();
                break;
        }
    } else { // Scrolling up
        switch (currentState) {
            case 'abstract':
                navigateToState('title');
                break;
            case 'content':
                if (currentSectionIndex === 0 && currentParagraphIndex === 0) {
                    navigateToState('abstract');
                } else {
                    navigateToPreviousParagraph();
                }
                break;
        }
    }
    
    setTimeout(() => {
        isScrolling = false;
    }, 500);
}

function navigateToState(state, sectionIndex = 0, paragraphIndex = 0) {
    currentState = state;
    currentSectionIndex = sectionIndex;
    currentParagraphIndex = paragraphIndex;
    
    // Update URL with hierarchy information
    const url = new URL(window.location);
    url.searchParams.set('state', state);
    
    if (state === 'content') {
        const section = contentMap.get(`section_${sectionIndex}`);
        if (section && section.paragraphs[paragraphIndex]) {
            url.searchParams.set('section', sectionIndex.toString());
            url.searchParams.set('paragraph', paragraphIndex.toString());
            
            // Clear existing subsection parameters
            url.searchParams.delete('subsection');
            url.searchParams.delete('subsubsection');
            
            // First find the immediate context (level 1 or 2)
            let currentLevel = null;
            let subsectionTitle = null;
            let subSubsectionTitle = null;
            
            // Search backwards to find our current context and titles
            for (let i = paragraphIndex; i >= 0; i--) {
                const p = section.paragraphs[i];
                if (p.isSubsectionTitle) {
                    if (!currentLevel) {
                        currentLevel = p.level;
                    }
                    
                    if (p.level === 2 && currentLevel === 2 && !subSubsectionTitle) {
                        subSubsectionTitle = p.full_text;
                        // Continue searching for the parent subsection
                        continue;
                    }
                    
                    if (p.level === 1) {
                        // Only accept this as our subsection if we haven't found one
                        // or if this is the parent of our sub-subsection
                        if (!subsectionTitle && (!subSubsectionTitle || i < paragraphIndex)) {
                            subsectionTitle = p.full_text;
                            if (!subSubsectionTitle) break; // If we're not in a sub-subsection, we're done
                        }
                    }
                    
                    // If we have both titles we need, we're done
                    if (subsectionTitle && (currentLevel === 1 || subSubsectionTitle)) {
                        break;
                    }
                }
            }
            
            // Update URL parameters based on what we found
            if (subsectionTitle) {
                url.searchParams.set('subsection', subsectionTitle);
            }
            if (subSubsectionTitle) {
                url.searchParams.set('subsubsection', subSubsectionTitle);
            }
        }
    } else {
        // Remove section-related params for non-content states
        url.searchParams.delete('section');
        url.searchParams.delete('paragraph');
        url.searchParams.delete('subsection');
        url.searchParams.delete('subsubsection');
    }
    
    window.history.pushState({}, '', url);
    
    // Clear content and render
    const contentSection = document.getElementById('content-section');
    contentSection.innerHTML = '';
    
    switch (state) {
        case 'title':
            renderTitle();
            break;
        case 'abstract':
            renderAbstract();
            break;
        case 'content':
            renderSection(`section_${sectionIndex}`, paragraphIndex);
            break;
    }
}

function navigateToNextParagraph() {
    const section = contentMap.get(`section_${currentSectionIndex}`);
    if (!section) return;

    currentParagraphIndex++;
    
    // Check if we've reached the end of the current section
    if (currentParagraphIndex >= section.paragraphs.length) {
        // Check if there's another section
        const nextSection = contentMap.get(`section_${currentSectionIndex + 1}`);
        if (nextSection) {
            currentSectionIndex++;
            currentParagraphIndex = 0;
        } else {
            // If no next section, stay at the last paragraph of the current section
            currentParagraphIndex = section.paragraphs.length - 1;
        }
    }
    
    navigateToState('content', currentSectionIndex, currentParagraphIndex);
}

function navigateToPreviousParagraph() {
    const section = contentMap.get(`section_${currentSectionIndex}`);
    if (!section) return;

    // If we're at a content paragraph that follows a subsection title,
    // we need to go back two indices
    if (currentParagraphIndex > 0) {
        const currentParagraph = section.paragraphs[currentParagraphIndex];
        const prevParagraph = section.paragraphs[currentParagraphIndex - 1];
        
        if (!currentParagraph.isSubsectionTitle && prevParagraph?.isSubsectionTitle) {
            currentParagraphIndex -= 2;
        } else {
            currentParagraphIndex--;
        }
    } else if (currentParagraphIndex <= 0) {
        if (currentSectionIndex > 0) {
            currentSectionIndex--;
            const prevSection = contentMap.get(`section_${currentSectionIndex}`);
            if (prevSection) {
                currentParagraphIndex = prevSection.paragraphs.length - 1;
            }
        } else {
            navigateToState('abstract');
            return;
        }
    }

    // Ensure we don't go below 0
    if (currentParagraphIndex < 0) {
        if (currentSectionIndex > 0) {
            currentSectionIndex--;
            const prevSection = contentMap.get(`section_${currentSectionIndex}`);
            if (prevSection) {
                currentParagraphIndex = prevSection.paragraphs.length - 1;
            }
        } else {
            navigateToState('abstract');
            return;
        }
    }
    
    navigateToState('content', currentSectionIndex, currentParagraphIndex);
}

// functions that actually render content to user
function renderTitle() {
    const contentSection = document.getElementById('content-section');
    const titleDiv = document.createElement('div');
    titleDiv.classList.add('section', 'title');
    titleDiv.style.cssText = `
        height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        position: fixed;
        width: 100%;
        top: 0;
        left: 0;
        padding: 0 20px;
    `;

    // Format authors with their institutions and clickable email links
    const authorText = titleMap.get('authors')
        .map(author => 
            `${author.fullName}${author.institution} <a href="mailto:${author.email}">${author.email}</a>`
        )
        .join('<br>');

    // Get publication info
    const pubInfo = titleMap.get('pubInfo');

    titleDiv.innerHTML = `
        <h1 style="text-align: center; max-width: 800px; margin-bottom: 1.5em;">
            ${titleMap.get('title')}
        </h1>
        <p style="text-align: center; max-width: 800px; margin-bottom: 2em;">
            ${authorText}
        </p>
        <div style="text-align: center; max-width: 800px; margin-bottom: 1em;">
            <p style="margin-bottom: 1em;"><strong>Conference:</strong> ${pubInfo.conferenceInfo}</p>
            <p style="margin-bottom: 1em;"><strong>DOI:</strong> <a href="${pubInfo.doi}" target="_blank">${pubInfo.doi}</a></p>
            <p style="margin-bottom: 1em;"><strong>Keywords:</strong> ${titleMap.get('keywords')}</p>
            <p><strong>CCS Concepts:</strong> ${titleMap.get('concepts')}</p>
        </div>
        <div style="text-align: center; max-width: 800px; font-size: 0.9em;">
            ${titleMap.get('referenceFormat')}
        </div>
    `;

    contentSection.appendChild(titleDiv);
}

function renderAbstract() {
    const contentSection = document.getElementById('content-section');
    const abstractSection = document.createElement('div');
    abstractSection.classList.add('section', 'abstract');
    abstractSection.style.height = '100vh';
    abstractSection.style.display = 'flex';
    abstractSection.style.flexDirection = 'column';
    abstractSection.style.justifyContent = 'center';
    abstractSection.style.position = 'fixed';  // Keep it in viewport
    abstractSection.style.width = '100%';
    abstractSection.style.top = '0';
    abstractSection.style.left = '0';
    abstractSection.innerHTML = `
        <h2 class="section-header" style="text-align: center; margin-bottom: 2em;">Abstract</h2>
        <div class="text-panel" style="max-width: 800px; margin: 0 auto; padding: 0 20px;">
            <p>${content?.abstract?.full_text || 'Abstract text'}</p>
        </div>
    `;
    contentSection.appendChild(abstractSection);
}

// methods that render content to user

// helper method
// used in renderSubsection, createSectionsPanel
function renderParagraph(paragraph, textPanel, visualsPanel) {
    const paraDiv = document.createElement('div');
    paraDiv.classList.add('paragraph');
    paraDiv.innerHTML = `<p>${paragraph.full_text}</p>`;
    textPanel.appendChild(paraDiv);
    

    // Render visuals associated with sentences in this paragraph
    paragraph.sentences.forEach(sentence => {
        if (sentence.associated_visual) {
            const visualDiv = document.createElement('div');
            visualDiv.classList.add('visual-element');
            visualDiv.id = 'visual-' + sentence.associated_visual;
            visualDiv.innerHTML = `<img src="/static/images/${sentence.associated_visual}.jpg" alt="Visual for ${sentence.associated_visual}">`;
            visualsPanel.appendChild(visualDiv);
        }
    });
}

// used in the createSectionsPanel method
function renderSubsection(subsection, textPanel, visualsPanel) {
    const subsectionDiv = document.createElement('div');
    subsectionDiv.classList.add('section');
    
    // Add the header
    const headerDiv = document.createElement('div');
    headerDiv.classList.add('section-header');
    headerDiv.textContent = subsection.title;
    subsectionDiv.appendChild(headerDiv);

    // Render paragraphs directly using the passed textPanel and visualsPanel
    subsection.paragraphs.forEach(paragraph => {
        renderParagraph(paragraph, textPanel, visualsPanel);
    });

    textPanel.appendChild(subsectionDiv);
}

// used in renderSection
function renderList(list, textPanel) {
    let listElement;
    if (list.type === 'ol') {
        listElement = document.createElement('ol');
    } else {
        listElement = document.createElement('ul');
    }

    list.sentences.forEach(listItem => {
        const listItemElement = document.createElement('li');
        listItemElement.innerHTML = `<span class="sentence">${listItem.text}</span>`;
        listElement.appendChild(listItemElement);
    });

    textPanel.appendChild(listElement);
}

function renderSection(sectionKey, paragraphIndex = 0) {
    const section = contentMap.get(sectionKey);
    if (!section) return;

    const contentSection = document.getElementById('content-section');
    const sectionDiv = document.createElement('div');
    sectionDiv.classList.add('section');
    sectionDiv.style.height = '100vh';
    sectionDiv.style.display = 'flex';
    sectionDiv.style.flexDirection = 'column';
    sectionDiv.style.justifyContent = 'center';
    sectionDiv.style.position = 'fixed';
    sectionDiv.style.top = '0';
    sectionDiv.style.left = '0';
    sectionDiv.style.width = '100%';
    
    let currentParagraph = section.paragraphs[paragraphIndex];
    if (currentParagraph) {
        console.log('Current paragraph:', {
            text: currentParagraph.full_text,
            sentences: currentParagraph.sentences,
            associated_visual: currentParagraph.associated_visual
        });

        // Find the first subsection title's index
        let firstSubsectionIndex = section.paragraphs.length;
        for (let i = 0; i < section.paragraphs.length; i++) {
            if (section.paragraphs[i].isSubsectionTitle) {
                firstSubsectionIndex = i;
                break;
            }
        }

        // Only skip subsection titles if we're past the introduction
        if (paragraphIndex >= firstSubsectionIndex && currentParagraph.isSubsectionTitle) {
            currentParagraphIndex++;
            const nextParagraph = section.paragraphs[currentParagraphIndex];
            if (nextParagraph) {
                currentParagraph = nextParagraph;
            }
        }

        let contentHTML = `
            <h2 class="section-header" style="text-align: center; margin-bottom: 1em;">
                ${section.title}
            </h2>
            <div class="content-container" style="display: flex; justify-content: space-between; max-width: 1200px; margin: 0 auto;">
                <div class="text-panel" style="max-width: 800px; padding: 0 20px;">
        `;

        // Only show subsection titles if we're past the introduction
        if (paragraphIndex >= firstSubsectionIndex) {
            let subsectionTitle = null;
            let subSubsectionTitle = null;
            let currentContext = null;
            
            for (let i = paragraphIndex; i >= firstSubsectionIndex; i--) {
                const p = section.paragraphs[i];
                if (p.isSubsectionTitle) {
                    if (!currentContext) {
                        currentContext = p.level;
                    }
                    if (p.level === 1 && !subsectionTitle) {
                        subsectionTitle = p.full_text;
                    } else if (p.level === 2 && !subSubsectionTitle && currentContext === 2) {
                        subSubsectionTitle = p.full_text;
                        if (!subsectionTitle) {
                            for (let j = i - 1; j >= firstSubsectionIndex; j--) {
                                const parent = section.paragraphs[j];
                                if (parent.isSubsectionTitle && parent.level === 1) {
                                    subsectionTitle = parent.full_text;
                                    break;
                                }
                            }
                        }
                    }
                    if (subsectionTitle && (currentContext === 1 || subSubsectionTitle)) break;
                }
            }

            if (subsectionTitle) {
                contentHTML += `<h3 style="text-align: center; margin-bottom: 0.8em;">${subsectionTitle}</h3>`;
            }
            if (subSubsectionTitle) {
                contentHTML += `<h4 style="text-align: center; margin-bottom: 0.6em;">${subSubsectionTitle}</h4>`;
            }
        }

        // Add a flag to track if any highlights were found
        let highlightsFound = false;
        
        let paragraphText = currentParagraph.full_text;
        
        console.log('Highlights state:', {
            highlightsOn,
            hasAssociatedVisual: !!currentParagraph.associated_visual
        });
        
        // If highlights are enabled, apply highlighting
        if (highlightsOn && currentParagraph.associated_visual) {
            const visual = visualElementsMap.get(currentParagraph.associated_visual);
            console.log('Visual data:', {
                visualFound: !!visual,
                visualId: currentParagraph.associated_visual,
                paragraphSentences: currentParagraph.sentences.map(s => s.text),
                captionSentences: visual?.caption?.sentences?.map(s => s.text)
            });
            
            if (visual) {
                const paragraphSentences = currentParagraph.sentences.map(s => s.text);
                const captionSentences = visual.caption.sentences.map(s => s.text);
                const similarityThreshold = 0.3;
                
                paragraphSentences.forEach((paragraphSentence, pIndex) => {
                    captionSentences.forEach((captionSentence, cIndex) => {
                        const similarity = calculateCosineSimilarity(paragraphSentence, captionSentence);
                        
                        if (similarity > similarityThreshold) {
                            highlightsFound = true;  // Set flag when highlights are found
                            const highlightId = `highlight-${pIndex}-${cIndex}`;
                            
                            // Add hoverable spans to paragraph
                            const escapedParagraphSentence = paragraphSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const paragraphRegex = new RegExp(`(${escapedParagraphSentence})`, 'g');
                            paragraphText = paragraphText.replace(
                                paragraphRegex, 
                                `<span class="hoverable-text" data-highlight-id="${highlightId}" 
                                style="cursor: pointer;">$1</span>`
                            );
                        }
                    });
                });
            }
        }

        // Update lightbulb button appearance based on highlights
        const lightbulbBtn = document.getElementById('lightbulbBtn');
        if (highlightsOn) {
            if (highlightsFound) {
                lightbulbBtn.style.backgroundColor = '#ffd700'; // Golden yellow when highlights found
            } else {
                lightbulbBtn.style.boxShadow = '0 0 10px rgba(255, 215, 0, 0.5)'; // Just the glow when no highlights found
                lightbulbBtn.style.backgroundColor = 'white';
            }
        } else {
            // Reset to default when highlights are off
            lightbulbBtn.style.backgroundColor = 'white';
            lightbulbBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        }

        // Add citation and figure links (existing code)
        paragraphText = paragraphText.replace(/\[([^\]]+)\]/g, (match, numbers) => {
            const citations = numbers.split(',').map(num => num.trim());
            const linkedCitations = citations.map(num => 
                `<span class="citation-link" data-citation-num="${num}" style="cursor: pointer; color: #0066cc;">${num}</span>`
            );
            return '[' + linkedCitations.join(', ') + ']';
        });

        paragraphText = paragraphText.replace(/Figure (\d+)/g, (match, figureNum) => {
            return `<span class="figure-link" data-figure-num="${figureNum}" style="cursor: pointer; color: #0066cc;">Figure ${figureNum}</span>`;
        });

        contentHTML += `<p>${paragraphText}</p>`;

        // If this paragraph has lists, render them
        if (currentParagraph.lists && currentParagraph.lists.length > 0) {
            console.log('Rendering lists for paragraph:', currentParagraph.lists);
            
            // Group all list items by type
            const groupedLists = {};
            currentParagraph.lists.forEach(list => {
                if (!groupedLists[list.type]) {
                    groupedLists[list.type] = [];
                }
                if (list.sentences) {
                    groupedLists[list.type].push(...list.sentences);
                }
            });

            // Render each group as a single list
            Object.entries(groupedLists).forEach(([type, sentences]) => {
                contentHTML += `<${type}>`;
                sentences.forEach(sentence => {
                    contentHTML += `<li>${sentence.text}</li>`;
                });
                contentHTML += `</${type}>`;
            });
        }

        // Check if this is the last paragraph of the current subsection
        let isLastParagraphOfSubsection = false;
        let currentSubsectionLevel = currentParagraph.subsectionLevel;
        
        if (currentSubsectionLevel) {
            // Look ahead to find the next paragraph with a different subsection level
            let nextDifferentLevelIndex = section.paragraphs.length;
            for (let i = paragraphIndex + 1; i < section.paragraphs.length; i++) {
                const nextParagraph = section.paragraphs[i];
                if (nextParagraph.isSubsectionTitle || 
                    (nextParagraph.subsectionLevel && nextParagraph.subsectionLevel !== currentSubsectionLevel)) {
                    nextDifferentLevelIndex = i;
                    break;
                }
            }
            isLastParagraphOfSubsection = paragraphIndex === nextDifferentLevelIndex - 1;
        } else {
            // For main section paragraphs
            isLastParagraphOfSubsection = paragraphIndex === section.paragraphs.length - 1;
        }

        // If this is the last paragraph of its context, show relevant lists
        if (isLastParagraphOfSubsection && section.lists && section.lists.length > 0) {
            // Filter lists based on the current context
            const relevantLists = section.lists.filter(list => {
                if (currentSubsectionLevel) {
                    return list.subsectionLevel === currentSubsectionLevel;
                }
                return !list.subsectionLevel; // Main section lists
            });

            // Group all list items by type
            const groupedLists = {};
            relevantLists.forEach(list => {
                if (!groupedLists[list.type]) {
                    groupedLists[list.type] = [];
                }
                if (list.sentences) {
                    groupedLists[list.type].push(...list.sentences);
                }
            });

            // Render each group as a single list
            Object.entries(groupedLists).forEach(([type, sentences]) => {
                contentHTML += `<${type}>`;
                sentences.forEach(sentence => {
                    contentHTML += `<li>${sentence.text}</li>`;
                });
                contentHTML += `</${type}>`;
            });
        }

        contentHTML += '</div>';

        // Add the visual panel
        if (currentParagraph.associated_visual) {
            const visualData = visualElementsMap.get(currentParagraph.associated_visual);
            const visualCaption = visualData.caption.full_text;
            const visualPath = visualData.path.split('/').pop();
            console.log("visualPath", visualPath);
            if (visualData) {
                contentHTML += `<div class="visual-panel" style="width: 500px; padding: 20px;">`;
                
                if (visualData.type === 'figure') {
                    contentHTML += `
                        <img src="/static/images/${visualPath}" 
                             style="width: 100%; height: auto; margin-bottom: 10px;">
                    `;
                } else if (visualData.type === 'table') {
                    // Filter out duplicate rows
                    const uniqueRows = visualData.rows.filter((row, index, self) =>
                        index === self.findIndex((r) => r[0] === row[0] && r[1] === row[1])
                    );

                    contentHTML += `
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                            <tbody>
                                ${uniqueRows.map((row, rowIndex) => `
                                    <tr>
                                        ${row.map((cell, cellIndex) => 
                                            `<td style="border: 1px solid #ddd; padding: 8px;">${cell}</td>`
                                        ).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }

                // Add caption for both types
                contentHTML += `
                    <p style="font-style: italic; font-size: 0.9em; margin-top: 5px;">
                        ${visualCaption}
                    </p>
                </div>`;
            }
        }

        contentHTML += '</div>';
        sectionDiv.innerHTML = contentHTML;
        contentSection.appendChild(sectionDiv);

        // Get the newly created paragraph element after the content is added to DOM
        const paragraphElement = sectionDiv.querySelector('.text-panel p');
        const visualPanel = sectionDiv.querySelector('.visual-panel');

        // After appending content, if highlights are on, also highlight the caption
        if (highlightsOn && currentParagraph.associated_visual) {
            const visual = visualElementsMap.get(currentParagraph.associated_visual);
            if (visual) {
                const captionElement = visualPanel?.querySelector('p[style*="font-style: italic"]');
                if (captionElement) {
                    let highlightedCaptionText = visual.caption.full_text;
                    const paragraphSentences = currentParagraph.sentences.map(s => s.text);
                    const captionSentences = visual.caption.sentences.map(s => s.text);
                    const similarityThreshold = 0.3;

                    paragraphSentences.forEach((paragraphSentence, pIndex) => {
                        captionSentences.forEach((captionSentence, cIndex) => {
                            const similarity = calculateCosineSimilarity(paragraphSentence, captionSentence);
                            
                            if (similarity > similarityThreshold) {
                                const highlightId = `highlight-${pIndex}-${cIndex}`;
                                const escapedCaptionSentence = captionSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const captionRegex = new RegExp(`(${escapedCaptionSentence})`, 'g');
                                highlightedCaptionText = highlightedCaptionText.replace(
                                    captionRegex, 
                                    `<span class="hoverable-text" data-highlight-id="${highlightId}" 
                                    style="cursor: pointer;">$1</span>`
                                );
                            }
                        });
                    });
                    
                    captionElement.innerHTML = highlightedCaptionText;
                }
            }
        }

        // Add hover event listeners if highlights are on
        if (highlightsOn) {
            const hoverableElements = document.querySelectorAll('.hoverable-text');
            hoverableElements.forEach(element => {
                element.addEventListener('mouseenter', (e) => {
                    const highlightId = e.target.dataset.highlightId;
                    const correspondingElements = document.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
                    correspondingElements.forEach(el => {
                        el.style.backgroundColor = 'yellow';
                        el.style.transition = 'background-color 0.3s';
                    });
                });

                element.addEventListener('mouseleave', (e) => {
                    const highlightId = e.target.dataset.highlightId;
                    const correspondingElements = document.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
                    correspondingElements.forEach(el => {
                        el.style.backgroundColor = 'transparent';
                    });
                });
            });
        }

        // Reattach other event listeners
        attachEventListeners(paragraphElement);
    }

    // Add event listeners for citation links after rendering
    const citationLinks = sectionDiv.querySelectorAll('.citation-link');
    citationLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const num = link.dataset.citationNum;
            const citation = Array.from(citationsMap.values()).find(c => 
                c.label.replace(/[\[\]]/g, '') === num
            );
            if (citation) {
                createCitationPopup(citation);
            }
        });
    });

    // Add event listeners for figure links after rendering
    const figureLinks = sectionDiv.querySelectorAll('.figure-link');
    figureLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const figureNum = link.dataset.figureNum;
            
            // Log to help debug
            console.log('Looking for figure:', figureNum);
            console.log('Available visuals:', Array.from(visualElementsMap.entries()));
            
            // Try different potential ID formats
            const potentialIds = [
                `figure${figureNum}`,
                `fig${figureNum}`,
                figureNum.toString(),
                `f${figureNum}`
            ];
            
            let visual = null;
            for (const id of potentialIds) {
                if (visualElementsMap.has(id)) {
                    visual = visualElementsMap.get(id);
                    console.log('Found visual with ID:', id);
                    break;
                }
            }
                
            if (visual) {
                createVisualPopup(visual, figureNum);
            } else {
                console.log('Could not find visual for figure:', figureNum);
            }
        });
    });
}

// methods that handle navigation bar and popups

function createNavigationBar() {
    const nav = document.createElement('nav');
    nav.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        height: 100vh;
        width: 60px;
        background-color: var(--panel-bg);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 20px;
        box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        z-index: 1000;
        transition: background-color 0.3s;
    `;

    const sectionsPanel = document.createElement('div');
    sectionsPanel.style.cssText = `
        position: fixed;
        left: -240px;
        top: 0;
        height: 100vh;
        width: 270px;
        background-color: white;
        box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        transition: left 0.3s ease;
        z-index: 999;
        display: flex;
        flex-direction: column;
    `;

    // Create a container for the scrollable content
    const scrollContainer = document.createElement('div');
    scrollContainer.style.cssText = `
        padding: 20px;
        padding-bottom: 120px;
        overflow-y: auto;
        flex-grow: 1;
        position: relative; /* Added for event handling */
    `;

    // Track whether mouse is over the panel
    let isMouseOverPanel = false;

    // Add mouse enter/leave detection for the panel
    sectionsPanel.addEventListener('mouseenter', () => {
        isMouseOverPanel = true;
    });

    sectionsPanel.addEventListener('mouseleave', () => {
        isMouseOverPanel = false;
    });

    // Handle wheel events globally when panel is open
    document.addEventListener('wheel', (event) => {
        if (sectionsPanel.style.left === '60px') {  // Panel is open
            if (!isMouseOverPanel) {
                event.preventDefault();  // Prevent scrolling outside panel
            }
        }
    }, { passive: false });  // Important for preventDefault to work

    // Prevent default scrolling on space and arrow keys when panel is open
    document.addEventListener('keydown', (event) => {
        if (sectionsPanel.style.left === '60px' && !isMouseOverPanel) {
            if (event.key === ' ' || 
                event.key === 'ArrowUp' || 
                event.key === 'ArrowDown' || 
                event.key === 'PageUp' || 
                event.key === 'PageDown') {
                event.preventDefault();
            }
        }
    });

    function toggleMainScroll(disable) {
        const contentSection = document.getElementById('content-section');
        const mainContent = document.querySelector('main');
        
        if (disable) {
            // Store current scroll position
            document.body.dataset.scrollPosition = window.pageYOffset;
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.top = `-${window.pageYOffset}px`;
            
            if (contentSection) {
                contentSection.style.overflow = 'hidden';
            }
            if (mainContent) {
                mainContent.style.overflow = 'hidden';
            }
        } else {
            // Restore scroll position
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
            
            const scrollPosition = document.body.dataset.scrollPosition;
            if (scrollPosition) {
                window.scrollTo(0, parseInt(scrollPosition));
            }
            
            if (contentSection) {
                contentSection.style.overflow = '';
            }
            if (mainContent) {
                mainContent.style.overflow = '';
            }
        }
    }

    function createStyledButton(text, level = 0, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            width: 100%;
            padding: 10px;
            padding-left: ${20 + (level * 20)}px;
            margin-bottom: 4px;
            border: none;
            border-radius: 4px;
            background-color: ${level === 0 ? '#f0f0f0' : '#f8f8f8'};
            cursor: pointer;
            text-align: left;
            font-size: ${14 - (level * 0.5)}px;
            transition: background-color 0.2s;
            color: ${level === 0 ? '#000' : '#333'};
            font-weight: ${level === 0 ? 'bold' : 'normal'};
        `;

        button.onmouseover = () => button.style.backgroundColor = '#e0e0e0';
        button.onmouseout = () => button.style.backgroundColor = level === 0 ? '#f0f0f0' : '#f8f8f8';
        
        if (onClick) {
            button.onclick = (e) => {
                onClick(e);
                toggleMainScroll(false);
            };
        }

        return button;
    }

    // Move all section buttons into the scroll container instead of directly in the panel
    const sections = Array.from(contentMap.keys());
    sections.forEach(sectionKey => {
        const section = contentMap.get(sectionKey);
        
        const sectionButton = createStyledButton(section.title, 0, () => {
            navigateToState('content', sectionKey.split('_')[1], 0);
            sectionsPanel.style.left = '-240px';
            panelOpen = false;
        });
        scrollContainer.appendChild(sectionButton);

        const addedSubsections = new Set();
        section.paragraphs.forEach((paragraph, index) => {
            if (paragraph.isSubsectionTitle && !addedSubsections.has(paragraph.full_text)) {
                addedSubsections.add(paragraph.full_text);
                
                const subsectionButton = createStyledButton(paragraph.full_text, paragraph.level, () => {
                    navigateToState('content', sectionKey.split('_')[1], index);
                    sectionsPanel.style.left = '-240px';
                    panelOpen = false;
                });
                scrollContainer.appendChild(subsectionButton);
            }
        });
    });

    // Add the scroll container to the panel
    sectionsPanel.appendChild(scrollContainer);
    document.body.appendChild(sectionsPanel);

    // Create the buttons
    const buttons = [
        { 
            id: 'menuBtn', 
            icon: '<img src="static/images/nav.png" width="20" height="20">',
            onClick: () => {
                const isOpen = sectionsPanel.style.left === '60px';
                sectionsPanel.style.left = isOpen ? '-240px' : '60px';
                panelOpen = !isOpen;
                toggleMainScroll(!isOpen);
            }
        },
        { 
            id: 'referencesBtn', 
            icon: '<img src="static/images/references.png" width="20" height="20">',
            onClick: () => {
                const citationsPanel = document.getElementById('citations-panel');
                if (citationsPanel.style.left === '60px') {
                    citationsPanel.style.left = '-100%';
                    citationsPanelOpen = false;
                    toggleMainScroll(false);
                } else {
                    citationsPanel.style.left = '60px';
                    citationsPanelOpen = true;
                    toggleMainScroll(true);
                }
            }
        },
        { 
            id: 'diagramsBtn', 
            icon: '<img src="static/images/diagrams.png" width="20" height="20">',
            onClick: () => {
                const diagramsPanel = document.getElementById('diagrams-panel');
                if (diagramsPanelOpen) {
                    diagramsPanel.style.left = '-100%';
                    diagramsPanelOpen = false;
                    toggleMainScroll(false);
                } else {
                    diagramsPanel.style.left = '60px';
                    diagramsPanelOpen = true;
                    toggleMainScroll(true);
                }
            }
        }
    ];

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.id = btn.id;
        button.innerHTML = btn.icon;
        button.style.cssText = `
            width: 40px;
            height: 40px;
            margin-bottom: 10px;
            border: none;
            border-radius: 8px;
            background-color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: background-color 0.2s;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 8px;
        `;

        button.onmouseover = () => button.style.backgroundColor = '#f0f0f0';
        button.onmouseout = () => button.style.backgroundColor = 'white';
        if (btn.onClick) {
            button.onclick = btn.onClick;
        }
        
        nav.appendChild(button);
    });

    // Add lightbulb button above dark mode
    const lightbulbBtn = document.createElement('button');
    lightbulbBtn.id = 'lightbulbBtn';
    lightbulbBtn.style.cssText = `
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 8px;
        background-color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        padding: 8px;
        position: absolute;
        bottom: 70px;  /* Position it above the dark mode button */
        left: 10px;
    `;

    // Add lightbulb icon
    lightbulbBtn.innerHTML = '<img src="static/images/lightbulb.png" width="20" height="20">';
    
    lightbulbBtn.onmouseover = () => lightbulbBtn.style.backgroundColor = '#f0f0f0';
    lightbulbBtn.onmouseout = () => lightbulbBtn.style.backgroundColor = 'white';
    
    // Add click handler (you can customize this)
    lightbulbBtn.onclick = toggleHighlights;

    
    
    nav.appendChild(lightbulbBtn);

    // Add dark mode button at the bottom of nav
    const darkModeBtn = document.createElement('button');
    darkModeBtn.id = 'darkModeBtn';
    darkModeBtn.style.cssText = `
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 8px;
        background-color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        padding: 8px;
        position: absolute;
        bottom: 20px;
        left: 10px;
    `;

    // Add moon icon
    darkModeBtn.innerHTML = '<img src="static/images/moon.png" width="20" height="20">';
    
    darkModeBtn.onmouseover = () => darkModeBtn.style.backgroundColor = '#f0f0f0';
    darkModeBtn.onmouseout = () => darkModeBtn.style.backgroundColor = 'white';
    
    // Add click handler for dark mode toggle
    darkModeBtn.onclick = toggleDarkMode;
    
    nav.appendChild(darkModeBtn);

    document.body.appendChild(nav);
    
    // Add click outside listener
    document.addEventListener('click', (event) => {
        const isClickInsideNav = nav.contains(event.target);
        const isClickInsidePanel = sectionsPanel.contains(event.target);
        
        if (!isClickInsideNav && !isClickInsidePanel && sectionsPanel.style.left === '60px') {
            sectionsPanel.style.left = '-240px';
            panelOpen = false;
            toggleMainScroll(false);
        }
    });

    // Adjust main content margin
    const contentSection = document.getElementById('content-section');
    if (contentSection) {
        contentSection.style.marginLeft = '60px';
    }
}

function createDiagramsPanel() {
    const diagramsPanel = document.createElement('div');
    diagramsPanel.id = 'diagrams-panel';
    diagramsPanel.style.cssText = `
        position: fixed;
        left: -100%;
        top: 0;
        height: 100vh;
        width: calc(100vw - 60px);
        background-color: var(--panel-bg);
        z-index: 998;
        box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        transition: left 0.7s ease, background-color 0.3s;
    `;

    // Create scroll container with custom scrollbar
    const scrollContainer = document.createElement('div');
    scrollContainer.style.cssText = `
        height: 100%;
        overflow-y: auto;
        padding: 20px;

        /* Custom scrollbar styles */
        &::-webkit-scrollbar {
            width: 8px;
        }
        
        &::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        
        &::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
        }
        
        &::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
    `;

    // Move the grid container inside the scroll container
    const gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
        padding: 20px;
    `;

    // Add all visual elements to the grid
    visualElementsMap.forEach((visual, id) => {
        // Skip if ID contains underscore
        if (id.includes('_')) return;

        const itemContainer = document.createElement('div');
        itemContainer.style.cssText = `
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 10px;
            cursor: pointer;
            transition: transform 0.2s, background-color 0.3s;
            background-color: var(--button-bg);
            display: flex;
            flex-direction: column;
            min-height: 300px;
            overflow: hidden;
        `;
        
        itemContainer.onmouseover = () => itemContainer.style.transform = 'scale(1.02)';
        itemContainer.onmouseout = () => itemContainer.style.transform = 'scale(1)';

        // Get the title (text before the colon)
        const titleMatch = visual.caption.full_text.match(/^([^:]+):/);
        const title = titleMatch ? titleMatch[1] : visual.caption.full_text;

        if (visual.type === 'figure') {
            itemContainer.innerHTML = `
                <img src="/static/images/${visual.path.split('/').pop()}" 
                     style="width: 100%; height: auto; border-radius: 4px;">
                <p style="margin-top: auto; font-weight: bold; text-align: center;">${title}</p>
            `;
        } else if (visual.type === 'table') {
            const tableContainer = document.createElement('div');
            tableContainer.style.cssText = `
                max-height: 200px;
                flex: 1;
                overflow: hidden;
                margin-bottom: 10px;
            `;
            
            // Create a preview of the table
            const table = document.createElement('table');
            table.style.cssText = `
                width: 100%;
                border-collapse: collapse;
            `;
            
            // Add a few rows as preview
            const previewRows = visual.rows.slice(0, 3);
            previewRows.forEach(row => {
                const tr = document.createElement('tr');
                row.forEach(cell => {
                    const td = document.createElement('td');
                    td.style.cssText = 'border: 1px solid #ddd; padding: 4px; font-size: 0.9em;';
                    td.textContent = cell;
                    tr.appendChild(td);
                });
                table.appendChild(tr);
            });
            
            tableContainer.appendChild(table);
            itemContainer.appendChild(tableContainer);
            itemContainer.innerHTML += `<p style="margin-top: 10px; font-weight: bold; text-align: center; margin-bottom: auto;">${title}</p>`;
        }

        // Add click handler for popup
        itemContainer.onclick = () => createVisualPopup(visual, id);
        
        gridContainer.appendChild(itemContainer);
    });

    scrollContainer.appendChild(gridContainer);
    diagramsPanel.appendChild(scrollContainer);
    document.body.appendChild(diagramsPanel);
    
    return diagramsPanel;
}

function createVisualPopup(visual, id) {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: ${darkModeOn ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.8)'};
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: ${darkModeOn ? '#2d2d2d' : 'white'};
        color: ${darkModeOn ? 'white' : 'black'};
        padding: 20px;
        border-radius: 8px;
        max-width: 90vw;
        max-height: 90vh;
        position: relative;
        overflow-y: auto;
    `;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        border: none;
        background: none;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
        color: ${darkModeOn ? '#fff' : '#666'};
    `;

    if (visual.type === 'figure') {
        content.innerHTML = `
            <img src="/static/images/${visual.path.split('/').pop()}" 
                 style="max-width: 100%; max-height: 70vh; display: block; margin: 0 auto;">
            <p style="margin-top: 20px; padding: 0 40px;">${visual.caption.full_text}</p>
        `;
    } else if (visual.type === 'table') {
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        `;
        
        visual.rows.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cell => {
                const td = document.createElement('td');
                td.style.cssText = 'border: 1px solid #ddd; padding: 8px;';
                td.textContent = cell;
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });
        
        content.appendChild(table);
        const caption = document.createElement('p');
        caption.style.cssText = 'padding: 0 40px;';
        caption.textContent = visual.caption.full_text;
        content.appendChild(caption);
    }

    closeButton.addEventListener('click', () => {
        document.body.removeChild(popup);
    });

    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    });

    content.appendChild(closeButton);
    popup.appendChild(content);
    document.body.appendChild(popup);
}

function createCitationsPanel() {
    const citationsPanel = document.createElement('div');
    citationsPanel.id = 'citations-panel';
    citationsPanel.style.cssText = `
        position: fixed;
        left: -100%;
        top: 0;
        height: 100vh;
        width: calc(100vw - 60px);
        background-color: var(--panel-bg);
        z-index: 998;
        box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        transition: left 0.3s ease, background-color 0.3s;
        overflow-y: auto;
        padding: 40px;
    `;

    // Create header
    const header = document.createElement('h2');
    header.textContent = 'References';
    header.style.cssText = `
        margin-bottom: 30px;
        text-align: center;
    `;
    citationsPanel.appendChild(header);

    // Create citations list
    const citationsList = document.createElement('div');
    citationsList.style.cssText = `
        max-width: 800px;
        margin: 0 auto;
    `;

    // Sort citations by their label number
    const sortedCitations = Array.from(citationsMap.entries())
        .sort((a, b) => {
            const numA = parseInt(a[1].label.match(/\d+/)[0]);
            const numB = parseInt(b[1].label.match(/\d+/)[0]);
            return numA - numB;
        });

    sortedCitations.forEach(([id, citation]) => {
        const citationItem = document.createElement('div');
        citationItem.style.cssText = `
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 8px;
            background-color: var(--hover-color);
            transition: background-color 0.2s;
            word-wrap: break-word;
        `;

        // Remove extra brackets from the label
        const cleanLabel = citation.label.replace(/\[|\]/g, '');

        // Create citation text with clickable URLs
        const citationText = citation.citation.replace(
            /(https?:\/\/[^\s<>"]+)/g,
            '<a href="$1" target="_blank" style="color: #0066cc; text-decoration: none;">$1</a>'
        );

        citationItem.innerHTML = `
            <span style="font-weight: bold; margin-right: 10px;">[${cleanLabel}]</span>
            ${citationText}
        `;

        // // Add hover effects
        // if (darkModeOn) {
        //     citationItem.onmouseover = () => citationItem.style.backgroundColor = '#333333';
        //     citationItem.onmouseout = () => citationItem.style.backgroundColor = '#2d2d2d';
        // } else {
        //     citationItem.onmouseover = () => citationItem.style.backgroundColor = '#f0f0f0';
        //     citationItem.onmouseout = () => citationItem.style.backgroundColor = '#f8f8f8';
        // }


        citationsList.appendChild(citationItem);
    });

    citationsPanel.appendChild(citationsList);
    document.body.appendChild(citationsPanel);

    // Add padding at the bottom to ensure last citation is fully visible
    citationsList.style.paddingBottom = '120px';
}

function createCitationPopup(citation) {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${darkModeOn ? '#2d2d2d' : 'white'};
        color: ${darkModeOn ? 'white' : 'black'};
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        max-width: 600px;
        width: 90%;
        z-index: 1001;
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${darkModeOn ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)'};
        z-index: 1000;
    `;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        border: none;
        background: none;
        font-size: 20px;
        cursor: pointer;
        padding: 5px;
        line-height: 1;
        color: ${darkModeOn ? '#fff' : '#666'};
    `;

    // Create citation content with clickable URLs
    const citationText = citation.citation.replace(
        /(https?:\/\/[^\s<>"]+)/g,
        '<a href="$1" target="_blank" style="color: #0066cc; text-decoration: none;">$1</a>'
    );

    const content = document.createElement('div');
    content.innerHTML = `
        <span style="font-weight: bold; margin-right: 10px;">${citation.label}</span>
        ${citationText}
    `;

    // Set up event listeners
    closeButton.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });

    popup.appendChild(closeButton);
    popup.appendChild(content);
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
}

function createSectionsPanel() {
    const sectionsPanel = document.createElement('div');
    sectionsPanel.id = 'sections-panel';
    sectionsPanel.style.cssText = `
        position: fixed;
        left: -240px;
        top: 0;
        width: 240px;
        height: 100vh;
        padding: 20px;
        box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        overflow-y: auto;
        z-index: 999;
    `;

    // Add main section headers
    const sections = [
        { title: 'INTRODUCTION', type: 'header' },
        { title: 'RELATED WORK', type: 'header' },
        { title: 'AI-Enhanced Design Tools', type: 'subsection' },
        { title: 'Applications of Generative AI in Design', type: 'subsection' },
        { title: 'AI-enhanced Software Testing', type: 'subsection' },
        { title: 'Heuristics and Design Guidelines', type: 'subsection' }
    ];

    sections.forEach(section => {
        const sectionDiv = document.createElement('div');
        sectionDiv.classList.add('section');
        sectionDiv.innerHTML = `
            <div class="section-header">${section.title}</div>
            <div class="text-panel"></div>
            <div class="visual-panel"></div>
        `;
        const textPanel = sectionDiv.querySelector('.text-panel');
        const visualsPanel = sectionDiv.querySelector('.visual-panel');

        // Render paragraphs
        section.paragraphs.forEach(paragraph => {
            renderParagraph(paragraph, textPanel, visualsPanel);
        });

        // Render subsections if any
        if (section.subsections) {
            section.subsections.forEach(subsection => {
                renderSubsection(subsection, textPanel, visualsPanel);
            });
        }

        // Render lists if any
        if (section.lists) {
            section.lists.forEach(list => {
                renderList(list, textPanel);
            });
        }

        sectionsPanel.appendChild(sectionDiv);
    });

    document.body.appendChild(sectionsPanel);
    return sectionsPanel;
}

// functions that store information from JSONs
function breakUpTitle(titleData) {
    titleMap.set('title', titleData.title);
    
    // Process authors with their details
    titleMap.set('authors', titleData.authors.map(author => ({
        fullName: `${author.givenName} ${author.surName}`,
        institution: author.institution,
        email: author.email
    })));
    
    // Process publication info
    titleMap.set('pubInfo', {
        doi: titleData.pubInfo.DOI,
        conferenceInfo: titleData.pubInfo.conference_info
    });
    
    // Process other metadata
    titleMap.set('keywords', titleData.Keywords);
    titleMap.set('concepts', titleData.CCSConcepts);
    titleMap.set('referenceFormat', titleData.ACMReferenceFormat);
}

function breakUpContent(content) {
    const body = content.body;
    let sectionIndex = 0;
    
    function getMajorityVisual(sentences) {
        if (!sentences || sentences.length === 0) return null;
    
        // Count occurrences of each associated_visual
        const visualCounts = {};
        sentences.forEach(sentence => {
            if (sentence.associated_visual) {
                visualCounts[sentence.associated_visual] = (visualCounts[sentence.associated_visual] || 0) + 1;
            }
        });
    
        // Find the most common associated_visual
        let majorityVisual = null;
        let maxCount = 0;
        
        Object.entries(visualCounts).forEach(([visual, count]) => {
            if (count > maxCount) {
                maxCount = count;
                majorityVisual = visual;
            }
        });
    
        return majorityVisual;
    }

    for (const section of body.sections) {
        let allParagraphs = [];
        
        // Add section's direct paragraphs first
        if (section.paragraphs) {
            const sectionParagraphs = section.paragraphs.map(p => ({
                ...p,
                lists: [],
                associated_visual: getMajorityVisual(p.sentences)
            }));
            
            // If section has lists, attach them to the last paragraph
            if (section.lists && section.lists.length > 0 && sectionParagraphs.length > 0) {
                sectionParagraphs[sectionParagraphs.length - 1].lists = section.lists;
            }
            
            allParagraphs = allParagraphs.concat(sectionParagraphs);
        }
        
        // Then add subsection content
        if (section.subsections && section.subsections.length > 0) {
            function flattenSubsections(subsections, level = 1) {
                subsections.forEach(subsection => {
                    // Add subsection title
                    allParagraphs.push({
                        full_text: subsection.title,
                        isSubsectionTitle: true,
                        level: level
                    });
                    
                    // Add subsection's paragraphs with their associated lists and visuals
                    if (subsection.paragraphs) {
                        let subsectionParagraphs = subsection.paragraphs.map(para => ({
                            ...para,
                            subsectionLevel: level,
                            lists: [],
                            associated_visual: getMajorityVisual(para.sentences)
                        }));
                        
                        // If the subsection has lists, attach them to the last paragraph
                        if (subsection.lists && subsection.lists.length > 0 && subsectionParagraphs.length > 0) {
                            subsectionParagraphs[subsectionParagraphs.length - 1].lists = subsection.lists;
                        }
                        
                        allParagraphs = allParagraphs.concat(subsectionParagraphs);
                    }
                    
                    // Handle nested subsections
                    if (subsection.subsections && subsection.subsections.length > 0) {
                        flattenSubsections(subsection.subsections, level + 1);
                    }
                });
            }
            
            flattenSubsections(section.subsections);
        }

        contentMap.set(`section_${sectionIndex}`, {
            type: 'section',
            title: section.title,
            paragraphs: allParagraphs
        });
        
        sectionIndex++;
    }
}

function processVisualElements(content) {
    const visualMap = new Map();
    
    if (content.body && content.body.visual_elements) {
        content.body.visual_elements.forEach(element => {
            const id = element.id;
            let visualData = {
                type: element.type,
                caption: element.caption,
                path: element.image?.src || "",
            };
            
            if (element.type === 'figure') {
                visualData.alt_text = element.alt;
            } else if (element.type === 'table') {
                visualData.headers = element.headers;
                visualData.rows = element.rows;
            }
            
            visualMap.set(id, visualData);
        });
    }
    
    return visualMap;
}



// add a function that will check for similarities in a caption and in the paragraph shown and highlight both that are s
// we will call this function when a user clicks the lightbulb button

function toggleHighlights() {
    highlightsOn = !highlightsOn;
    
    // Get current paragraph to check for highlights
    const section = contentMap.get(`section_${currentSectionIndex}`);
    if (!section || !section.paragraphs[currentParagraphIndex]) return;
    
    const currentParagraph = section.paragraphs[currentParagraphIndex];
    let highlightsFound = false;

    // Check for highlights in current paragraph
    if (highlightsOn && currentParagraph.associated_visual) {
        const visual = visualElementsMap.get(currentParagraph.associated_visual);
        if (visual) {
            const paragraphSentences = currentParagraph.sentences.map(s => s.text);
            const captionSentences = visual.caption.sentences.map(s => s.text);
            const similarityThreshold = 0.3;
            
            // Check for any matching sentences
            for (let paragraphSentence of paragraphSentences) {
                for (let captionSentence of captionSentences) {
                    if (calculateCosineSimilarity(paragraphSentence, captionSentence) > similarityThreshold) {
                        highlightsFound = true;
                        break;
                    }
                }
                if (highlightsFound) break;
            }
        }
    }

    // Update lightbulb button appearance
    const lightbulbBtn = document.getElementById('lightbulbBtn');
    if (highlightsOn) {
        if (highlightsFound) {
            lightbulbBtn.style.backgroundColor = '#ffd700'; // Golden yellow when highlights found
        } else {
            lightbulbBtn.style.boxShadow = '0 0 10px rgba(255, 215, 0, 0.5)'; // Just the glow when no highlights
            lightbulbBtn.style.backgroundColor = 'white';
        }
    } else {
        // Reset to default when highlights are off
        lightbulbBtn.style.backgroundColor = 'white';
        lightbulbBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    }

    // Force re-render of current section to apply/remove highlights
    navigateToState(currentState, currentSectionIndex, currentParagraphIndex);
}

// Helper function to attach event listeners
function attachEventListeners(element) {
    // Add event listeners for citation links
    const citationLinks = element.querySelectorAll('.citation-link');
    citationLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            const num = link.dataset.citationNum;
            const citation = Array.from(citationsMap.values()).find(c => 
                c.label.replace(/[\[\]]/g, '') === num
            );
            if (citation) {
                createCitationPopup(citation);
            }
        });
    });

    // Add event listeners for figure links
    const figureLinks = element.querySelectorAll('.figure-link');
    figureLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            const figureNum = link.dataset.figureNum;
            
            const potentialIds = [
                `figure${figureNum}`,
                `fig${figureNum}`,
                figureNum.toString(),
                `f${figureNum}`
            ];
            
            let visual = null;
            for (const id of potentialIds) {
                if (visualElementsMap.has(id)) {
                    visual = visualElementsMap.get(id);
                    break;
                }
            }
                
            if (visual) {
                createVisualPopup(visual, figureNum);
            }
        });
    });
}

// Add this function before toggleHighlights
function calculateCosineSimilarity(str1, str2) {
    // Convert strings to word frequency vectors
    function getWordFrequency(str) {
        const words = str.toLowerCase().match(/\b\w+\b/g) || [];
        const freq = {};
        words.forEach(word => {
            freq[word] = (freq[word] || 0) + 1;
        });
        return freq;
    }

    const freq1 = getWordFrequency(str1);
    const freq2 = getWordFrequency(str2);

    // Get all unique words
    const uniqueWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);

    // Calculate dot product and magnitudes
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    uniqueWords.forEach(word => {
        const f1 = freq1[word] || 0;
        const f2 = freq2[word] || 0;
        dotProduct += f1 * f2;
        magnitude1 += f1 * f1;
        magnitude2 += f2 * f2;
    });

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    // Prevent division by zero
    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    // Calculate cosine similarity
    return dotProduct / (magnitude1 * magnitude2);
}

// cool features to add?
// Add dark mode toggle function
function toggleDarkMode() {
    darkModeOn = !darkModeOn;
    const isDarkMode = document.body.classList.toggle('dark-mode');
    
    if (darkModeOn) {
        // Dark mode styles
        document.documentElement.style.setProperty('--bg-color', '#1a1a1a');
        document.documentElement.style.setProperty('--text-color', '#ffffff');
        document.documentElement.style.setProperty('--panel-bg', '#2d2d2d');
        document.documentElement.style.setProperty('--hover-color', '#3d3d3d');
        document.documentElement.style.setProperty('--border-color', '#404040');
    } else {
        // Light mode styles
        document.documentElement.style.setProperty('--bg-color', '#ffffff');
        document.documentElement.style.setProperty('--text-color', '#000000');
        document.documentElement.style.setProperty('--panel-bg', '#f5f5f5');
        document.documentElement.style.setProperty('--hover-color', '#e0e0e0');
        document.documentElement.style.setProperty('--border-color', '#ddd');
    }
}
