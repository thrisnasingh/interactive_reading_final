import json

# Function to parse and organize content
def parse_and_organize_json(json_data):
    organized_data = {
        'abstract': json_data.get('abstract', {}).get('full_text', ''),
        'sections': [],
        'visual_elements': []
    }

    # Process sections and subsections
    for section in json_data.get('body', {}).get('sections', []):
        section_data = {
            'title': section.get('title', ''),
            'paragraphs': [],
            'subsections': [],
            'lists': []
        }

        # Add paragraphs to the section with their associated visuals
        for paragraph in section.get('paragraphs', []):
            # Count occurrences of each associated_visual in the paragraph's sentences
            visual_counts = {}
            for sentence in paragraph.get('sentences', []):
                if 'associated_visual' in sentence:
                    visual = sentence['associated_visual']
                    visual_counts[visual] = visual_counts.get(visual, 0) + 1

            # Find the most common associated_visual
            majority_visual = None
            if visual_counts:
                majority_visual = max(visual_counts.items(), key=lambda x: x[1])[0]

            # Store both the text and the majority associated_visual
            paragraph_data = {
                'full_text': paragraph.get('full_text', ''),
                'associated_visual': majority_visual
            }
            section_data['paragraphs'].append(paragraph_data)

        # Add subsections
        for subsection in section.get('subsections', []):
            subsection_data = {
                'title': subsection.get('title', ''),
                'paragraphs': [para.get('full_text', '') for para in subsection.get('paragraphs', [])]
            }
            visual_counts = {}
            for sentence in subsection.get('sentences', []):
                if 'associated_visual' in sentence:
                    visual = sentence['associated_visual']
                    visual_counts[visual] = visual_counts.get(visual, 0) + 1

            # Find the most common associated_visual
            majority_visual = None
            if visual_counts:
                majority_visual = max(visual_counts.items(), key=lambda x: x[1])[0]

            # Store both the text and the majority associated_visual
            subsection_data = {
                'full_text': subsection.get('full_text', ''),
                'associated_visual': majority_visual
            }
            section_data['subsections'].append(subsection_data)

        # Add lists
        for list_item in section.get('lists', []):
            list_data = {
                'type': list_item.get('type', ''),
                'items': [item.get('text', '') for item in list_item.get('sentences', [])]
            }
            section_data['lists'].append(list_data)

        organized_data['sections'].append(section_data)

    # Process visual elements
    organized_data['visual_elements'] = [
        visual for visual in json_data.get('visual_elements', [])
        if '_' not in visual.get('id', '')
    ]

    return organized_data
