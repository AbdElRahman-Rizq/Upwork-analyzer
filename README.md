# Upwork Analyzer

AI-assisted pipeline for triaging Upwork jobs. The NestJS backend ingests raw job posts, batches them into Gemini API calls, filters for "easy / short" gigs, and logs accepted opportunities to a Google Sheet. A companion Chrome extension scrapes jobs directly from upwork.com and forwards them to the backend for analysis.

https://github.com/user-attachments/assets/

## Features

- **Gemini analysis with batching** – jobs are processed 10 at a time with automatic retry/backoff for HTTP 429 responses.
- **Structured feasibility scoring** – Gemini returns JSON containing `doable`, `complexity`, `estimated_days`, `why`, and a four-step roadmap.
- **Auto-filtering** – only jobs that are marked doable, with complexity ≤ 4 and ETA ≤ 14 days, are appended to your Google Sheet.
- **Google Sheets logging** – accepted jobs are appended as new rows with timestamp, job link, and raw Gemini decision for future reference.
- **Chrome extension scraper** – Manifest v3 extension gathers job title/description/link data directly from Upwork job lists and POSTs the payload to the backend.

## Tech Stack

- NestJS + TypeScript API (`src/*.ts`).
- Google Generative AI SDK for Gemini (`JobsService`).
- Google Docs API using a service-account key.
- Chrome extension (manifest, popup, content script) under `upwork-ext/`.

## Prerequisites

- Node.js 18+
- npm 10+
- Google Cloud service account with Sheets API enabled and JSON key (referenced in `JobsService.appendToGoogleSheet`).
- Google Gemini API key with access to `gemini-3-flash-preview` (or any model configured in `GEMINI_MODEL`).

## Configuration

Create a `.env` file in the project root:

```env
GEMINI_KEY=your_gemini_api_key
GOOGLE_SHEET_ID=your_target_sheet_id
GOOGLE_SHEET_RANGE=Sheet1!A:C         # optional, defaults to Sheet1!A:C
GEMINI_MODEL=gemini-3-flash-preview   # optional, defaults to gemini-1.5-flash
PORT=3001                             # optional
```

> Share the target Google Sheet with the service account email so it can insert rows. If you rename the key file, also update the path inside `appendToGoogleSheet` (`src/jobs.service.ts`).

## Installation & Local Run

```bash
npm install
npm run start:dev
```

The Nest app boots on `http://localhost:3001` with CORS enabled (`src/main.ts`).

## API

`POST /jobs/process`

```jsonc
[
  {
    "title": "Need NestJS dev",
    "description": "...",
