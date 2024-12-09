from bs4 import BeautifulSoup, NavigableString
import json
import re
import uuid
import os

def clean_text(text):
    # Remove extra whitespace and newlines
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def simple_sentence_tokenize(text):
    """Simple sentence tokenizer using common sentence endings"""
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in sentences if s.strip()]

def find_most_referenced_visual(text, all_visuals):
    """Find the visual element that is most referenced in the text, with priority to first mention"""
    figure_counts = {}
    table_counts = {}
    first_figure = None
    first_table = None
    
    # Find all visual references
    figure_matches = list(re.finditer(r'Figure\s+(\d+)', text))
    table_matches = list(re.finditer(r'Table\s+(\d+)', text))
    
    # Track first mentions
    if figure_matches:
        first_fig_num = figure_matches[0].group(1)
        first_figure = f"fig{first_fig_num}"
        
    if table_matches:
        first_table_num = table_matches[0].group(1)
        first_table = f"table{first_table_num}"
    
    # Count all mentions
    for match in figure_matches:
        fig_num = match.group(1)
        fig_id = f"fig{fig_num}"
        figure_counts[fig_id] = figure_counts.get(fig_id, 0) + 1
        
    for match in table_matches:
        table_num = match.group(1)
        table_id = f"table{table_num}"
        table_counts[table_id] = table_counts.get(table_id, 0) + 1
    
    # Validate references exist in all_visuals
    valid_visuals = {v['id'] for v in all_visuals}
    figure_counts = {k: v for k, v in figure_counts.items() if k in valid_visuals}
    table_counts = {k: v for k, v in table_counts.items() if k in valid_visuals}
    
    # Combine and find most referenced
    all_refs = {**figure_counts, **table_counts}
    
    if not all_refs:
        return None
        
    # Prioritize first mention if it has more than one mention
    if first_figure and figure_counts.get(first_figure, 0) > 0:
        return first_figure
    if first_table and table_counts.get(first_table, 0) > 0:
        return first_table
        
    return max(all_refs.items(), key=lambda x: x[1])[0]

def find_nearest_visual(element, all_visuals, text=None):
    """Find the most appropriate visual based on content or proximity"""
    # If text is provided, try to find the most referenced visual
    if text:
        most_referenced = find_most_referenced_visual(text, all_visuals)
        if most_referenced:
            return most_referenced
    
    # Fallback to proximity-based approach
    current = element.previous_sibling
    while current:
        if isinstance(current, NavigableString):
            current = current.previous_sibling
            continue
        if current.name in ['figure', 'table']:
            visual_id = current.get('id')
            # Skip if the ID contains an underscore
            if visual_id and '_' not in visual_id:
                return visual_id
        current = current.previous_sibling
    
    # If no previous visual found in siblings, find the most recent visual that appears before this element
    element_position = element.sourceline
    # Filter out visuals with underscore in their ID
    previous_visuals = [v for v in all_visuals 
                       if v['sourceline'] < element_position 
                       and '_' not in v['id']]
    if previous_visuals:
        return previous_visuals[-1]['id']
    return None

def process_abstract(abstract_div):
    """Process abstract div and split into sentences"""
    abstract_text = clean_text(abstract_div.get_text())
    sentences = simple_sentence_tokenize(abstract_text)
    
    # Find the first figure in the document
    first_figure = abstract_div.find_next('figure')
    first_figure_id = first_figure.get('id') if first_figure else None
    
    return {
        'full_text': abstract_text,
        'sentences': [{
            'id': f"abstract_s{i}",
            'text': sent,
            'context': 'Abstract',
            'associated_visual': first_figure_id
        } for i, sent in enumerate(sentences, 1)]
    }

def extract_visual_element(element, element_type):
    """Extract data for figure or table"""
    element_id = element.get('id', '')
    
    # Skip processing if ID contains underscore
    if '_' in element_id:
        return None
        
    sourceline = element.sourceline
    
    if element_type == 'figure':
        data = {
            'type': 'figure',
            'id': element_id,
            'sourceline': sourceline,
            'image': {
                'src': element.find('img')['src'] if element.find('img') else '',
                'alt': element.find('img')['alt'] if element.find('img') else ''
            },
            'caption': {
                'full_text': '',
                'sentences': []
            }
        }
        
        figcaption = element.find('figcaption')
        if figcaption:
            caption_text = clean_text(figcaption.get_text())
            data['caption'] = {
                'full_text': caption_text,
                'sentences': [{
                    'id': f"{element_id}_caption_s{i}",
                    'text': sent,
                    'context': f"Caption of Figure {element_id}",
                    'associated_visual': element_id
                } for i, sent in enumerate(simple_sentence_tokenize(caption_text), 1)]
            }
    else:
        # Table processing with improved caption handling
        if not element_id:
            caption_div = element.find_previous('div', class_='table-caption')
            if caption_div:
                caption_text = caption_div.get_text()
                table_num_match = re.search(r'Table\s+(\d+)', caption_text)
                if table_num_match:
                    element_id = f"table{table_num_match.group(1)}"
                else:
                    element_id = f"table_{str(uuid.uuid4())[:8]}"
            else:
                element_id = f"table_{str(uuid.uuid4())[:8]}"
            element['id'] = element_id
            
        data = {
            'type': 'table',
            'id': element_id,
            'sourceline': sourceline,
            'headers': [clean_text(th.get_text()) for th in element.find_all('th')],
            'rows': [[clean_text(cell.get_text()) for cell in row.find_all(['td', 'th'])]
                     for row in element.find_all('tr')],
            'caption': {
                'full_text': '',
                'sentences': []
            }
        }
        
        caption_div = element.find_previous('div', class_='table-caption')
        if not caption_div:
            caption_div = element.find_next('div', class_='table-caption')
            
        if caption_div:
            caption_text = clean_text(caption_div.get_text())
            table_num_match = re.search(r'Table\s+(\d+)', caption_text)
            current_table_num = re.search(r'table(\d+)', element_id)
            
            if (table_num_match and current_table_num and 
                table_num_match.group(1) == current_table_num.group(1)):
                data['caption'] = {
                    'full_text': caption_text,
                    'sentences': [{
                        'id': f"{element_id}_caption_s{i}",
                        'text': sent,
                        'context': f"Caption of Table {element_id}",
                        'associated_visual': element_id
                    } for i, sent in enumerate(simple_sentence_tokenize(caption_text), 1)]
                }
    
    return data

def normalize_section_number(section_number, parent_number=""):
    """Normalize section numbers to use only the significant parts"""
    if not section_number:
        return ""
    
    # Remove any parent number prefix if it exists
    if parent_number and section_number.startswith(parent_number):
        section_number = section_number[len(parent_number):].lstrip('.')
    
    # If it's a single number, return as is
    if section_number.isdigit():
        return section_number
    
    # Handle subsection numbers
    parts = section_number.strip().split('.')
    if len(parts) > 2:
        # For deep nesting (e.g., 5.4.1), keep the structure
        return section_number
    return section_number

def get_section_number_and_title(section):
    """Extract section number and title from a section header or emphasized text"""
    # First try regular header
    header = section.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    if header:
        number_span = header.find('span', class_='section-number')
        section_number = number_span.get_text().strip() if number_span else ""
        full_text = clean_text(header.get_text())
        title = full_text.replace(section_number, "").strip()
        return normalize_section_number(section_number), title
    
    # Then try emphasized section number in first paragraph
    first_p = section.find('p')
    if first_p:
        em_text = first_p.find('em')
        if em_text:
            section_num_span = em_text.find('span', class_='section-number')
            if section_num_span:
                section_number = section_num_span.get_text().strip()
                # Get full emphasized text and remove section number
                title = clean_text(em_text.get_text()).replace(section_number, '').strip()
                # If title ends with a period and text after, remove the period
                if '.' in title:
                    title = title.split('.')[0].strip()
                return normalize_section_number(section_number), title
    
    return "", ""

def process_list(list_element, all_visuals):
    """Process an ordered or unordered list"""
    items = []
    list_type = list_element.name  # 'ol' or 'ul'
    
    for index, li in enumerate(list_element.find_all('li', recursive=False), 1):
        item_text = clean_text(li.get_text())
        list_id = f"list_{str(uuid.uuid4())[:8]}"
        
        # Get the value attribute if it exists, otherwise use the index
        value = li.get('value', str(index))
        
        item_data = {
            'id': list_id,
            'full_text': item_text,
            'type': list_type,
            'value': value,  # Store the value attribute
            'sentences': [{
                'id': f"{list_id}_s1",
                'text': item_text,
                'context': 'List Item',
                'associated_visual': find_nearest_visual(li, all_visuals, item_text)
            }]
        }
        
        items.append(item_data)
    
    return items

def process_emphasized_paragraph(p, section_id, context, all_visuals):
    """Process a paragraph that starts with emphasized text, extracting both title and content"""
    full_text = clean_text(p.get_text())
    em = p.find('em')
    emphasized_text = clean_text(em.get_text()) if em else ""
    
    # Get the non-emphasized part of the text
    remaining_text = full_text[len(emphasized_text):].strip()
    if remaining_text.startswith('.'):
        remaining_text = remaining_text[1:].strip()
    
    if not remaining_text:
        return None
        
    associated_visual = find_nearest_visual(p, all_visuals, remaining_text)
    sentences = simple_sentence_tokenize(remaining_text)
    
    return {
        'full_text': remaining_text,
        'sentences': [{
            'id': f"{section_id}_p1_s{i}",
            'text': sent,
            'context': context,
            'associated_visual': associated_visual
        } for i, sent in enumerate(sentences, 1)]
    }

def process_section(section, all_visuals, parent_number=""):
    """Process a section and its contents, including nested sections"""
    section_id = section.get('id', f"section_{str(uuid.uuid4())[:8]}")
    section_number, section_title = get_section_number_and_title(section)
    
    # Special handling for main sections
    if section_id == "sec-9":  # Section 3
        section_number = "3"
    
    # Combine parent number with current section number if needed
    full_section_number = section_number
    if parent_number and section_number and not section_number.startswith(parent_number):
        if parent_number.isdigit() and '.' not in section_number:
            full_section_number = f"{parent_number}.{section_number}"
        else:
            full_section_number = normalize_section_number(section_number, parent_number)
    
    section_data = {
        'id': section_id,
        'section_number': full_section_number,
        'title': section_title,
        'paragraphs': [],
        'lists': [],
        'subsections': []
    }
    
    context = f"Section {full_section_number}: {section_title}" if full_section_number else section_title
    
    # Process all direct children in order
    for child in section.children:
        if isinstance(child, NavigableString) or child.name in ['header']:
            continue
            
        if child.name == 'section':
            # Process nested section
            subsection_data = process_section(child, all_visuals, full_section_number)
            if subsection_data['paragraphs'] or subsection_data['subsections'] or subsection_data['lists']:
                section_data['subsections'].append(subsection_data)
                
        elif child.name == 'p':
            if child.get('style') == 'display:none':
                continue
                
            # Check if this is a paragraph with emphasized section title
            if child.find('em') and child.find('span', class_='section-number'):
                # Process the rest of the paragraph content if it exists
                paragraph_data = process_emphasized_paragraph(child, section_id, context, all_visuals)
                if paragraph_data:
                    section_data['paragraphs'].append(paragraph_data)
            else:
                # Process regular paragraph
                text = clean_text(child.get_text())
                associated_visual = find_nearest_visual(child, all_visuals, text)
                sentences = simple_sentence_tokenize(text)
                
                paragraph_data = {
                    'full_text': text,
                    'sentences': [{
                        'id': f"{section_id}_p{len(section_data['paragraphs'])+1}_s{i}",
                        'text': sent,
                        'context': context,
                        'associated_visual': associated_visual
                    } for i, sent in enumerate(sentences, 1)]
                }
                section_data['paragraphs'].append(paragraph_data)
            
        elif child.name == 'ul' or child.name == 'ol':
            list_items = process_list(child, all_visuals)
            if list_items:
                section_data['lists'].extend(list_items)
                
        elif child.name in ['figure', 'table', 'div']:
            continue
    
    return section_data

def extract_front_matter(soup):
    """Extract front matter information from the HTML"""
    front_matter = soup.find('section', class_='front-matter')
    if not front_matter:
        return None
        
    data = {
        'title': '',
        'authors': [],
        'pubInfo': {
            'DOI': '',
            'conference_info': ''
        },
        'CCSConcepts': '',
        'Keywords': '',
        'ACMReferenceFormat': ''
    }
    
    # Extract title
    title_elem = front_matter.find('span', class_='title')
    if title_elem:
        data['title'] = clean_text(title_elem.get_text())
    
    # Extract authors
    author_group = front_matter.find('div', class_='authorGroup')
    if author_group:
        for author_div in author_group.find_all('div', class_='author'):
            author_data = {
                'givenName': '',
                'surName': '',
                'institution': '',
                'email': ''
            }
            
            # Extract name components
            given_name = author_div.find('span', class_='givenName')
            surname = author_div.find('span', class_='surName')
            if given_name:
                author_data['givenName'] = clean_text(given_name.get_text())
            if surname:
                author_data['surName'] = clean_text(surname.get_text())
            
            # Extract email
            email = author_div.find('a', href=lambda x: x and 'mailto:' in x)
            if email:
                author_data['email'] = email['href'].replace('mailto:', '')
            
            # Extract institution (text between name and email)
            text_parts = [t for t in author_div.stripped_strings]
            try:
                # Find institution text between name and email
                name_idx = text_parts.index(author_data['surName'])
                email_idx = text_parts.index(author_data['email'])
                if email_idx - name_idx > 1:
                    author_data['institution'] = clean_text(text_parts[name_idx + 1])
            except (ValueError, IndexError):
                pass
                
            data['authors'].append(author_data)
    
    # Extract publication info
    pub_info = front_matter.find('div', class_='pubInfo')
    if pub_info:
        doi_link = pub_info.find('a', href=lambda x: x and 'doi.org' in x)
        if doi_link:
            data['pubInfo']['DOI'] = doi_link['href']
            # Get conference info without DOI and "DOI:" prefix
            conf_text = clean_text(pub_info.get_text())
            conf_text = conf_text.split('DOI:')[1] if 'DOI:' in conf_text else conf_text
            conf_text = conf_text.replace(doi_link.get_text(), '').strip()
            data['pubInfo']['conference_info'] = conf_text
    
    # Extract CCS Concepts (without prefix and unicode)
    ccs = front_matter.find('div', class_='CCSconcepts')
    if ccs:
        ccs_text = clean_text(ccs.get_text())
        # Remove "CCS Concepts:" prefix and clean up unicode
        ccs_text = ccs_text.replace('CCS Concepts:', '').strip()
        ccs_text = ccs_text.encode('ascii', 'ignore').decode()  # Remove unicode
        data['CCSConcepts'] = ccs_text.strip()
    
    # Extract Keywords (renamed from Classifications)
    keywords = front_matter.find('div', class_='classifications')
    if keywords:
        keywords_text = clean_text(keywords.get_text())
        if 'Keywords:' in keywords_text and 'ACM Reference Format:' in keywords_text:
            keywords_text = keywords_text.split('Keywords:')[1].split('ACM Reference Format:')[0]
            data['Keywords'] = keywords_text.strip()
    
    # Extract ACM Reference Format (preserve HTML)
    acm_ref = front_matter.find('div', class_='AcmReferenceFormat')
    if acm_ref:
        data['ACMReferenceFormat'] = str(acm_ref)
    
    return data

def extract_references(soup):
    """Extract references from bibliography section and save to JSON"""
    references = []
    bib_ul = soup.find('ul', class_='bibUl')
    
    if not bib_ul:
        return None
        
    for ref in bib_ul.find_all('li'):
        # Get full text and clean it
        citation_text = clean_text(ref.get_text())
        
        # Remove everything after "Navigate"
        nav_index = citation_text.find('Navigate')
        if nav_index != -1:
            citation_text = citation_text[:nav_index].strip()
        
        reference = {
            'id': ref.get('id', ''),
            'label': ref.get('label', ''),
            'value': ref.get('value', ''),
            'citation': citation_text
        }
            
        references.append(reference)
    
    # Save to JSON file
    output_path = os.path.join('static', 'references.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(references, f, indent=4)
        
    print(f"Successfully saved references to {output_path}")
    return references

def html_to_json(html_file):
    with open(html_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    
    # Extract references
    references = extract_references(soup)
    if references:
        print(f"Extracted {len(references)} references")
    
    # Extract front matter first
    front_matter_data = extract_front_matter(soup)
    if front_matter_data:
        # Save front matter to title.json
        output_path = os.path.join('static', 'title.json')
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(front_matter_data, f, indent=4)
        print(f"Successfully saved front matter to {output_path}")
    
    # Continue with existing content processing...
    content = {
        'abstract': None,
        'body': {
            'sections': [],
            'visual_elements': []
        }
    }
    
    # Process abstract
    abstract_div = soup.find('div', class_='abstract')
    if abstract_div:
        content['abstract'] = process_abstract(abstract_div)

    # Find and process body section
    body_section = soup.find('section', class_='body')
    if body_section:
        # Process figures and tables first, searching recursively
        all_visuals = []
        for elem in soup.find_all(['figure', 'table']):  # Search entire document recursively
            element_type = elem.name
            visual_data = extract_visual_element(elem, element_type)
            content['body']['visual_elements'].append(visual_data)
            all_visuals.append(visual_data)

        # Sort visuals by source line to maintain sequence
        all_visuals.sort(key=lambda x: x['sourceline'])

        # Process all top-level sections
        for section in body_section.find_all('section', recursive=False):
            section_data = process_section(section, all_visuals)
            content['body']['sections'].append(section_data)

    # Save to JSON file
    output_path = os.path.join('static', 'content.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(content, f, indent=4)

    print(f"Successfully converted HTML to JSON. Saved to {output_path}")
    return content

if __name__ == "__main__":
    html_file = "webpage_files/index.html"
    html_to_json(html_file)
