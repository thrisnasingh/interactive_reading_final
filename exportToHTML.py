from selenium import webdriver
from selenium.webdriver.common.by import By
import time
import os
import requests
from urllib.parse import urljoin, urlparse
import re

def download_resource(url, save_dir):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            # Create file path from URL
            parsed = urlparse(url)
            filename = os.path.basename(parsed.path)
            local_path = os.path.join(save_dir, parsed.path.lstrip('/'))
            
            # Create directories if they don't exist
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Save the file to original location
            with open(local_path, 'wb') as f:
                f.write(response.content)
            
            # If it's an image, also save to static/images
            if any(ext in filename.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif']):
                static_images_dir = os.path.join('static', 'images')
                static_path = os.path.join(static_images_dir, filename)
                
                # Copy to static/images directory
                with open(static_path, 'wb') as f:
                    f.write(response.content)
            
            return local_path
    except Exception as e:
        print(f"Failed to download {url}: {e}")
    return None

def save_webpage_to_html(url, output_dir):
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, 'index.html')
    
    # Configure Chrome options
    chrome_options = webdriver.ChromeOptions()
    chrome_options.add_argument('--headless')
    
    # Start WebDriver
    driver = webdriver.Chrome(options=chrome_options)

    # Delete existing JPG files before saving new ones
    static_images_dir = os.path.join('static', 'images')
    #if directory exists, delete all jpg files in it
    if os.path.exists(static_images_dir):
        for file in os.listdir(static_images_dir):
            if file.lower().endswith(('.jpg', '.jpeg')):
                os.remove(os.path.join(static_images_dir, file))
    
    try:
        # Open the website
        driver.get(url)
        
        # Wait for JavaScript to load
        time.sleep(5)
        
        # Get the page source
        html_content = driver.page_source
        
        # Add error handler script to suppress error messages
        error_handler = '''
        <script>
            // Override console.error
            console.error = function() {};
            
            // Suppress all errors
            window.addEventListener('error', function(e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                return true;
            }, true);
            
            // Suppress unhandled rejections
            window.addEventListener('unhandledrejection', function(e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                return true;
            }, true);
            
            // MathJax specific error handling
            window.MathJax = {
                messageStyle: "none",
                showMathMenu: false,
                showMathMenuMSIE: false,
                errorSettings: { 
                    message: [""] 
                },
                extensions: ["tex2jax.js"],
                jax: ["input/TeX", "output/HTML-CSS"],
                tex2jax: {
                    inlineMath: [["$","$"],["\\(","\\)"]],
                    displayMath: [["$$","$$"],["\\[","\\]"]],
                    processEscapes: true
                },
                "HTML-CSS": { 
                    showMathMenu: false 
                }
            };
            
            // Hide Live Server error overlay
            const style = document.createElement('style');
            style.textContent = `
                .error-message { display: none !important; }
                #error-box { display: none !important; }
                #error-overlay { display: none !important; }
                .MathJax_Error { display: none !important; }
            `;
            document.head.appendChild(style);
        </script>
        '''
        # Insert error handler after opening head tag
        html_content = html_content.replace('<head>', '<head>' + error_handler)
        
        # Find all resources (CSS, JS, images)
        resource_urls = re.findall(r'(href|src)=["\']([^"\']+)["\']', html_content)
        base_url = '/'.join(url.split('/')[:3])  # Get base URL (protocol + domain)
        
        # Download resources and update paths
        for attr, resource_url in resource_urls:
            if resource_url.startswith('//'):
                full_url = 'https:' + resource_url
            elif resource_url.startswith('/'):
                full_url = base_url + resource_url
            elif not resource_url.startswith(('http://', 'https://')):
                full_url = urljoin(url, resource_url)
            else:
                full_url = resource_url
                
            if any(ext in full_url.lower() for ext in ['.css', '.js', '.jpg', '.png', '.gif']):
                local_path = download_resource(full_url, output_dir)
                if local_path:
                    relative_path = os.path.relpath(local_path, output_dir)
                    html_content = html_content.replace(f'{attr}="{resource_url}"', f'{attr}="{relative_path}"')
        
        # Save the modified HTML
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
            
        print(f"Successfully saved webpage to {output_dir}")
            
    finally:
        driver.quit()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        url = sys.argv[1]  # Get URL from command line argument
        output_dir = "webpage_files"
        save_webpage_to_html(url, output_dir)
    else:
        print("No URL provided")

