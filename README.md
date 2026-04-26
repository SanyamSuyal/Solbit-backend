# Solbit Backend

Production-ready Express.js backend for Solbit, serving AI-optimized UI components from MongoDB.

## Features

- Express.js API with modular architecture (`routes`, `controllers`, `services`, `middleware`)
- MongoDB integration via Mongoose
- API key auth (`Authorization: Bearer <API_KEY>`)
- Input validation, prompt normalization, keyword extraction
- Groq-powered intent parsing (primary/secondary/features)
- Component retrieval and weighted scoring
- Clean JSON responses for AI tools, terminal scripts, and external apps
- CORS enabled globally
- Rate limiting, security headers, and request sanitization

## Project Structure

```text
src/
	app.js
	server.js
	config/
	controllers/
	middleware/
	models/
	routes/
	services/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Start server:

```bash
npm start
```

## Environment Variables

- `PORT` (default: `3000`)
- `MONGODB_URI` (required in production)
- `API_KEYS` (required in production, comma-separated)
- `GROQ_API_KEY` (required for `/generate` intent parsing)
- `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
- `GROQ_TIMEOUT_MS` (default: `6000`)
- `RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `RATE_LIMIT_MAX` (default: `120`)

## Authentication

Protected endpoints require:

```text
Authorization: Bearer <API_KEY>
```

Default test keys:

- `sk-test-123`
- `sk-test-456`

## Endpoints

### `GET /health`

Returns:

```json
{ "status": "ok" }
```

### `POST /generate` (Protected)

### `POST /api/v1/search` (Protected, alias of `/generate`)

Request body:

```json
{
	"prompt": "modern dashboard sidebar with dark mode",
	"framework": "nextjs",
	"styling": "tailwind"
}
```

- `prompt` is required
- `framework` defaults to `nextjs`
- `styling` defaults to `tailwind`

Response format:

```json
{
	"project_context": {
		"framework": "nextjs",
		"styling": "tailwind",
		"typescript": true,
		"theme": {
			"primary": "#6366f1",
			"background": "#0b1020",
			"text": "#e5e7eb",
			"border": "#1f2937",
			"fonts": { "body": "Inter, system-ui, sans-serif" },
			"spacing": { "sm": "8px", "md": "12px", "lg": "20px" },
			"borderRadius": "10px",
			"darkMode": true
		}
	},
	"intent": {
		"primary": "form",
		"secondary": "sidebar",
		"features": ["email", "input"]
	},
	"generated_prompt": {
		"source": "groq",
		"text": "Prompt text for the caller AI to execute"
	},
	"prompt_guide": {
		"role": "...",
		"meta_instruction": "...",
		"execute": "..."
	},
	"results": [
		{
			"name": "...",
			"description": "...",
			"code": "...",
			"import": "...",
			"usage": "...",
			"dependencies": ["..."],
			"installCommand": "...",
			"props": [],
			"whyThis": "Why this matches the prompt"
		}
	],
	"llmGuidance": {
		"instructions": "After receiving this component, integrate it cleanly into the existing project. Ensure imports are correct, dependencies are installed, and adapt styling to match the current UI. Do not hallucinate missing parts. Prefer modifying existing layout instead of rewriting everything."
	}
}
```

Intent behavior:

- `primary` is parsed by Groq and used as strict retrieval filter: `uiPattern === primary`
- `secondary` and `features` are only used for local ranking boosts
- Groq does not select components or rank results

### `GET /component/:id` (Protected)

Fetch a single component by MongoDB ObjectId.

## Deploy on Render

### Option A: Blueprint (`render.yaml`)

1. Push this repo to GitHub.
2. In Render: `New +` -> `Blueprint`.
3. Select the repository.
4. Render will read `render.yaml` and create `solbit-backend` service.
5. In Render dashboard, set secret env vars:
	- `MONGODB_URI`
	- `GROQ_API_KEY`
	- `API_KEYS` (for example: `sk-prod-abc,sk-prod-def`)
6. Deploy and wait until health check passes at `/health`.

### Option B: Manual Web Service

1. In Render: `New +` -> `Web Service`.
2. Connect repository branch.
3. Set:
	- Runtime: `Node`
	- Build Command: `npm install`
	- Start Command: `npm start`
4. Add env vars:
	- `NODE_ENV=production`
	- `MONGODB_URI=<your-mongodb-uri>`
	- `GROQ_API_KEY=<your-groq-key>`
	- `GROQ_MODEL=llama-3.1-8b-instant`
	- `GROQ_TIMEOUT_MS=6000`
	- `API_KEYS=<comma-separated-api-keys>`
	- `RATE_LIMIT_WINDOW_MS=60000`
	- `RATE_LIMIT_MAX=120`
5. Deploy.

### Post-deploy smoke test

```bash
curl -X POST https://<your-render-url>/api/v1/search \
  -H "Authorization: Bearer <one-api-key-from-API_KEYS>" \
  -H "Content-Type: application/json" \
  -d '{
	 "prompt": "modern SaaS pricing section with 3 plans and CTA buttons"
  }'
```

Expected: response includes `best`, `results`, `generated_prompt`, and `prompt_guide`.

## CLI Usage Example

```bash
curl -X POST http://localhost:3000/generate \
	-H "Authorization: Bearer sk-test-123" \
	-H "Content-Type: application/json" \
	-d '{
		"prompt": "modern dashboard sidebar with dark mode"
	}'
```

## Error Format

All errors are returned as consistent JSON:

```json
{
	"error": "message"
}
```

Common status codes:

- `400` invalid request
- `401` invalid or missing API key
- `404` route/component not found
- `500` internal server error