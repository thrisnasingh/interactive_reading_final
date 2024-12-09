To run program:

First, make sure that you have the following dependencies installed:

We first need to install selenium requests:
   pip install selenium requests

We also need to install webdriver-manager. The intent of this command is to install ChromeDriver. 
I had manually installed ChromeDriver in the past, but I updated the code so that this should work.
If that doesn't work, you can manually install ChromeDriver here: https://googlechromelabs.github.io/chrome-for-testing/#stable. 
If you install manually, make sure to install the version that matches your computer under Stable.
    pip install webdriver-manager

This is a Flask application, so make sure you have Flask installed as well: 
    pip install Flask

This program is run using Python3. To run the program, run the following command:
    python3 app.py

Note: If you do not have Python3 installed, you will need to update these lines in app.py to state python rather than python3:

        # Run exportToHTML.py with the URL
        subprocess.run(['python3', 'exportToHTML.py', url], check=True)
        
        # Run HTMLToJSON.py
        subprocess.run(['python3', 'HTMLToJSON.py'], check=True)

Once you run the command, the Flask application will run. It will state Running on http://127.0.0.1:5000. 
You can then go to that URL in your browser to use the program.

Everything should be run in Chrome. You can imput in a HTML journal URL to use the program.
Here is a URL that you can use: https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642782
