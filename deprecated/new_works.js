async function generateHTML() {
    try {
        const response = await fetch('/static/content.json');
        const content = await response.json();
        console.log('Content loaded successfully');

        // Start building HTML
        let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Paper Viewer</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Merriweather', serif;
            line-height: 1.6;
            color: #333;
        }
        
        .container {
            display: flex;
            gap: 40px;
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100vh;
        }

        .content-panel {
            flex: 0 0 45%;  /* Take 45% of the viewport width */
            padding: 40px;
            overflow-y: auto;
            height: 100vh;
            box-sizing: border-box;
        }

        .visuals-panel {
            flex: 0 0 45%;  /* Take 45% of the viewport width */
            position: sticky;
            top: 0;
            height: 100vh;
            overflow-y: auto;
            padding: 40px;
            background: #fff;
            box-sizing: border-box;
        }

        .visual-element {
            margin-bottom: 40px;
            padding: 20px;
            border: 1px solid #eee;
            border-radius: 8px;
            background: #fff;
        }

        .visual-element img {
            width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
            max-width: 100%;
            object-fit: contain;
        }

        .visual-element .caption {
            margin-top: 10px;
            font-size: 0.9em;
            color: #666;
        }

        /* Remove display: none from visual-element */
        /* We'll handle visibility through opacity for smoother transitions */
        .visual-element {
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }

        .visual-element.visible {
            opacity: 1;
            pointer-events: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Left panel: Content -->
        <div class="content-panel">
            <article>
                <section class="abstract">
                    <h2>Abstract</h2>
                    ${generateParagraph(content.abstract)}
                </section>
                ${generateSections(content.body.sections)}
            </article>
        </div>

        <!-- Right panel: Visuals -->
        <div class="visuals-panel">
            ${generateVisualElements(content.body.visual_elements)}
        </div>
    </div>

    <script>
        // Update visible visuals based on visible text
        function updateVisibleVisuals() {
            const visibleSentences = document.querySelectorAll('.sentence[data-has-visual]');
            const visualElements = document.querySelectorAll('.visual-element');
            
            console.log('Found visible sentences:', visibleSentences.length);
            console.log('Found visual elements:', visualElements.length);
            
            // Create a set of visible visual IDs
            const visibleVisualIds = new Set();
            visibleSentences.forEach(sentence => {
                const visualId = sentence.dataset.hasVisual;
                visibleVisualIds.add(visualId);
                console.log('Adding visual ID to visible set:', visualId);
            });

            // Update visibility of each visual element
            visualElements.forEach(el => {
                const visualId = el.id.replace('visual-', '');
                const shouldBeVisible = visibleVisualIds.has(visualId);
                console.log('Visual element:', visualId, 'Should be visible:', shouldBeVisible);
                el.classList.toggle('visible', shouldBeVisible);
            });
        }

        // Call updateVisibleVisuals more frequently
        document.addEventListener('DOMContentLoaded', updateVisibleVisuals);
        document.addEventListener('scroll', () => {
            requestAnimationFrame(updateVisibleVisuals);
        });
        window.addEventListener('resize', updateVisibleVisuals);
    </script>
</body>
</html>`;

        return html;

    } catch (error) {
        console.error('Error generating HTML:', error);
        throw error;
    }
}

function generateSections(sections, level = 2) {
    if (!sections) return '';
    
    return sections.map(section => `
        <section id="${section.id}">
            <h${level}>${section.title}</h${level}>
            ${generateParagraphs(section.paragraphs)}
            ${generateLists(section.lists)}
            ${section.subsections ? generateSections(section.subsections, level + 1) : ''}
        </section>
    `).join('');
}

function generateLists(lists) {
    if (!lists) return '';
    
    // Group items by list type
    let orderedItems = [];
    let unorderedItems = [];
    
    lists.forEach(list => {
        if (list.sentences) {
            if (list.type === 'ol') {
                orderedItems.push(list);
            } else {
                unorderedItems.push(list);
            }
        }
    });
    
    // Generate single ordered list if we have ordered items
    let output = '';
    if (orderedItems.length > 0) {
        output += `<ol>
            ${orderedItems.map((item, index) => `
                <li label="${index + 1}">
                    <span class="sentence" 
                          data-sentence-id="${item.sentences[0].id}"
                          ${item.sentences[0].associated_visual ? 
                            `data-has-visual="${item.sentences[0].associated_visual}"` : ''}>
                        ${item.sentences[0].text}
                    </span>
                </li>
            `).join('')}
        </ol>`;
    }
    
    // Generate unordered lists
    if (unorderedItems.length > 0) {
        output += unorderedItems.map(list => `
            <ul>
                <li>
                    <span class="sentence" 
                          data-sentence-id="${list.sentences[0].id}"
                          ${list.sentences[0].associated_visual ? 
                            `data-has-visual="${list.sentences[0].associated_visual}"` : ''}>
                        ${list.sentences[0].text}
                    </span>
                </li>
            </ul>
        `).join('');
    }
    
    return output;
}

function generateParagraphs(paragraphs) {
    if (!paragraphs) return '';
    
    return paragraphs.map(para => generateParagraph(para)).join('');
}

function generateParagraph(para) {
    if (!para) return '';
    
    if (para.full_text && !para.sentences) {
        return `<p>${para.full_text}</p>`;
    }
    
    if (para.sentences) {
        return `<p>
            ${para.sentences.map(sentence => `
                <span class="sentence" 
                      data-sentence-id="${sentence.id}"
                      ${sentence.associated_visual ? `data-has-visual="${sentence.associated_visual}"` : ''}>
                    ${sentence.text}
                </span>
            `).join(' ')}
        </p>`;
    }
    
    return '';
}

// New function to generate visual elements
function generateVisualElements(visuals) {
    if (!visuals) {
        console.log('No visuals provided');
        return '';
    }
    
    console.log('Processing visuals:', visuals);
    
    return visuals.map(visual => {
        // Extract just the filename from the full path
        const imagePath = visual.image ? visual.image.src.split('/').pop() : null;
        console.log('Processing visual:', visual.id, 'Image path:', imagePath);
        
        return `
            <div id="visual-${visual.id}" class="visual-element visible">
                ${imagePath ? `<img src="/static/images/${imagePath}" alt="${visual.image.alt}" onerror="console.log('Failed to load image: ${imagePath}')">` : ''}
                ${visual.type === 'table' ? generateTable(visual) : ''}
                <div class="caption">
                    ${generateParagraph(visual.caption)}
                </div>
            </div>
        `;
    }).join('');
        // Hardcode one figure to test
    //     return `
    //     <div id="visual-fig1" class="visual-element visible">
    //         <img src="/static/images/chi24-886-fig1.jpg" alt="Figure 1">
    //         <div class="caption">
    //             <p>Figure 1: Test caption</p>
    //         </div>
    //     </div>
    // `;
}

// New function to generate tables
function generateTable(tableData) {
    if (!tableData.rows) return '';
    
    return `
        <table>
            ${tableData.rows.map(row => `
                <tr>
                    ${row.map(cell => `<td>${cell}</td>`).join('')}
                </tr>
            `).join('')}
        </table>
    `;
}

// Export the function if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateHTML };
}


