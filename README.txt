L'Oréal Routine Builder — Demo

Files:
- index.html : main UI
- styles.css : styles and RTL helpers
- script.js : front-end logic for selection, storage, and chat
- products.json : sample product data

How it works:
- Click a product card to select/unselect it. Selected cards get a highlighted border.
- Click "Details" on a card to see a modal with the product description (accessible).
- Selected products are saved to localStorage and persist across reloads.
- "Generate Routine" sends the selected products and conversation history to your Cloudflare Worker.
  The worker URL is already embedded in index.html and expected to be: https://openaiapikey.hangqi39.workers.dev
- The worker must implement endpoints:
    POST /generate  -> accepts { type:'generate_routine', products, history, webSearch }
    POST /chat      -> accepts { type:'follow_up', question, history, products, webSearch }
  and return JSON like: { text: "<assistant text>", citations: [{title, url}] }

Security note:
- No API keys are stored in the browser. The fetches go to your Cloudflare Worker which should securely hold the OpenAI key and call OpenAI servers.

LevelUp features included:
- Product search (realtime) + category filter.
- RTL support (toggle button).
- Chat remembers conversation history and includes selected products in each request.

Next steps / deployment:
- Deploy these static files to GitHub Pages (or any static host).
- Ensure your Cloudflare Worker is live and handles /generate and /chat as described.
