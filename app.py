from flask import Flask, render_template, request, redirect, url_for, jsonify
import os
import subprocess
import json

app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    return render_template('intro.html')

@app.route('/process', methods=['POST'])
def process():
    url = request.form['url']  # Get URL from the form
    
    try:
        # Run exportToHTML.py with the URL
        subprocess.run(['python3', 'exportToHTML.py', url], check=True)
        
        # Run HTMLToJSON.py
        subprocess.run(['python3', 'HTMLToJSON.py'], check=True)
        
        # After processing, redirect to the result page
        return redirect(url_for('show_result'))
    except subprocess.CalledProcessError as e:
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

@app.route('/result')
def show_result():
    return render_template('test.html')

# Flask route to serve the organized data
@app.route('/content')
def content():
    try:
        with open('static/content.json', 'r') as f:
            raw_data = json.load(f)
        return jsonify(raw_data), 200
    except FileNotFoundError:
        return jsonify({'error': 'content.json not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Failed to process content.json: {str(e)}'}), 500

if __name__ == "__main__":
    app.run(debug=True)
