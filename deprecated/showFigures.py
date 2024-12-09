import tkinter as tk
from tkinter import ttk
import json
from PIL import Image, ImageTk
import os

class ScrollableText(ttk.Frame):
    def __init__(self, container, *args, **kwargs):
        super().__init__(container, *args, **kwargs)
        
        # Create text widget with scrollbar
        self.text = tk.Text(self, wrap='word', width=60, height=10)  # Reduced height to show less text
        scrollbar = ttk.Scrollbar(self, orient='vertical', command=self.text.yview)
        self.text.configure(yscrollcommand=scrollbar.set)
        
        # Grid layout
        self.text.grid(row=0, column=0, sticky='nsew')
        scrollbar.grid(row=0, column=1, sticky='ns')
        
        # Configure grid weights
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)
        
        # Bind scroll event
        self.text.bind('<Key>', lambda e: 'break')  # Make text read-only

class ImageViewer(ttk.Frame):
    def __init__(self, container, *args, **kwargs):
        super().__init__(container, *args, **kwargs)
        
        # Create canvas for image
        self.canvas = tk.Canvas(self, width=800, height=600)
        self.canvas.grid(row=0, column=0, sticky='nsew')
        
        # Configure grid weights
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)
        
        self.current_image = None
        
    def show_image(self, image_path):
        try:
            # Clear previous image
            self.canvas.delete("all")
            
            if not image_path:
                self.canvas.create_text(400, 300, text="No image associated", font=('Arial', 14))
                return
                
            # Construct full image path
            full_path = os.path.join('webpage_files', image_path)
            if not os.path.exists(full_path):
                self.canvas.create_text(400, 300, text=f"Image not found: {image_path}", font=('Arial', 14))
                return
                
            # Load and resize image
            image = Image.open(full_path)
            
            # Calculate resize dimensions while maintaining aspect ratio
            canvas_ratio = 800 / 600
            image_ratio = image.width / image.height
            
            if image_ratio > canvas_ratio:
                # Image is wider than canvas ratio
                new_width = 800
                new_height = int(800 / image_ratio)
            else:
                # Image is taller than canvas ratio
                new_height = 600
                new_width = int(600 * image_ratio)
            
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Convert to PhotoImage and store reference
            self.current_image = ImageTk.PhotoImage(image)
            
            # Calculate center position
            x = (800 - new_width) // 2
            y = (600 - new_height) // 2
            
            # Display image
            self.canvas.create_image(x, y, anchor='nw', image=self.current_image)
            
        except Exception as e:
            self.canvas.create_text(400, 300, text=f"Error loading image: {str(e)}", font=('Arial', 14))

class MainApplication(tk.Tk):
    def __init__(self):
        super().__init__()
        
        self.title("Document Viewer")
        self.geometry("1400x800")
        
        # Create main container
        container = ttk.Frame(self)
        container.grid(row=0, column=0, sticky='nsew')
        
        # Configure grid weights
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)
        container.grid_columnconfigure(1, weight=1)
        container.grid_rowconfigure(0, weight=1)
        
        # Create navigation buttons
        nav_frame = ttk.Frame(container)
        self.prev_button = ttk.Button(nav_frame, text="Previous", command=self.show_previous)
        self.next_button = ttk.Button(nav_frame, text="Next", command=self.show_next)
        
        # Grid layout for navigation
        self.prev_button.grid(row=0, column=0, padx=5, pady=5)
        self.next_button.grid(row=0, column=1, padx=5, pady=5)
        nav_frame.grid(row=1, column=0, columnspan=2, sticky='ew')
        
        # Create text and image areas
        self.text_area = ScrollableText(container)
        self.image_viewer = ImageViewer(container)
        
        # Grid layout
        self.text_area.grid(row=0, column=0, sticky='nsew', padx=5, pady=5)
        self.image_viewer.grid(row=0, column=1, sticky='nsew', padx=5, pady=5)
        
        # Initialize content
        self.paragraphs = []
        self.current_index = 0
        self.load_content()
        
    def load_content(self):
        try:
            # Load JSON content
            with open('webpage_files/content.json', 'r', encoding='utf-8') as f:
                self.content = json.load(f)
            
            # Extract all paragraphs and their associated visuals
            self.paragraphs = []
            
            def process_sections(sections):
                for section in sections:
                    # Get section header
                    section_header = f"Section {section['section_number']}: {section['title']}\n\n" if section.get('section_number') and section.get('title') else ""
                    
                    # Process paragraphs
                    paragraphs = section.get('paragraphs', [])
                    if paragraphs:
                        # Combine first paragraph with section header
                        first_para = paragraphs[0]
                        visual_id = first_para['sentences'][0]['associated_visual'] if first_para['sentences'] else None
                        self.paragraphs.append({
                            'text': section_header + first_para['full_text'],
                            'visual_id': visual_id
                        })
                        
                        # Add remaining paragraphs
                        for para in paragraphs[1:]:
                            visual_id = para['sentences'][0]['associated_visual'] if para['sentences'] else None
                            self.paragraphs.append({
                                'text': para['full_text'],
                                'visual_id': visual_id
                            })
                    elif section_header:  # If section has no paragraphs but has a header
                        self.paragraphs.append({
                            'text': section_header.strip(),
                            'visual_id': None
                        })
                    
                    # Process subsections recursively
                    if section.get('subsections'):
                        process_sections(section['subsections'])
            
            # Start processing from top-level sections
            if self.content.get('body', {}).get('sections'):
                process_sections(self.content['body']['sections'])
            
            # Show first paragraph
            self.show_current_paragraph()
            
        except Exception as e:
            self.text_area.text.insert('1.0', f"Error loading content: {str(e)}")
    
    def show_current_paragraph(self):
        if not self.paragraphs:
            return
            
        # Clear existing content
        self.text_area.text.delete('1.0', tk.END)
        
        # Get current paragraph
        para = self.paragraphs[self.current_index]
        
        # Display paragraph
        self.text_area.text.insert(tk.END, para['text'])
        
        # Find and display associated visual
        if para['visual_id']:
            # First try to find a figure
            found_visual = False
            for visual in self.content['body']['visual_elements']:
                if visual['id'] == para['visual_id']:
                    if visual['type'] == 'figure':
                        self.image_viewer.show_image(visual['image']['src'])
                        found_visual = True
                        break
                    elif visual['type'] == 'table':
                        # Display table
                        table_text = "TABLE:\n\n"
                        # Add caption if available
                        if visual.get('caption', {}).get('full_text'):
                            table_text += visual['caption']['full_text'] + "\n\n"
                        # Add headers
                        if visual.get('headers'):
                            table_text += " | ".join(visual['headers']) + "\n"
                            table_text += "-" * (len(table_text) - 1) + "\n"
                        # Add rows
                        if visual.get('rows'):
                            for row in visual['rows']:
                                table_text += " | ".join(row) + "\n"
                        
                        self.image_viewer.canvas.delete("all")
                        self.image_viewer.canvas.create_text(
                            400, 300,
                            text=table_text,
                            font=('Courier', 12),
                            anchor='center',
                            justify='center'
                        )
                        found_visual = True
                        break
            
            if not found_visual:
                self.image_viewer.show_image(None)
        else:
            self.image_viewer.show_image(None)
        
        # Update button states
        self.prev_button['state'] = 'normal' if self.current_index > 0 else 'disabled'
        self.next_button['state'] = 'normal' if self.current_index < len(self.paragraphs) - 1 else 'disabled'
    
    def show_next(self):
        if self.current_index < len(self.paragraphs) - 1:
            self.current_index += 1
            self.show_current_paragraph()
    
    def show_previous(self):
        if self.current_index > 0:
            self.current_index -= 1
            self.show_current_paragraph()

if __name__ == "__main__":
    app = MainApplication()
    app.mainloop()
