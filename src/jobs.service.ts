import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JobsService {
  private genAI: GoogleGenerativeAI;
  private sheetId: string;
  private sheetRange: string;
  private readonly logger = new Logger(JobsService.name);

  private readonly MAX_COMPLEXITY = 4;
  private readonly MAX_DAYS = 14;
  private readonly GEMINI_MAX_ATTEMPTS = 4;
  private readonly GEMINI_BASE_DELAY_MS = 7000;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_KEY is missing in environment configuration.');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    this.sheetId = this.configService.get<string>('GOOGLE_SHEET_ID') || '';
    if (!this.sheetId) {
      this.logger.warn('GOOGLE_SHEET_ID is missing; Google Sheets updates will fail until it is provided.');
    }

    this.sheetRange = this.configService.get<string>('GOOGLE_SHEET_RANGE') || 'Sheet1!A:C';
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRetryDelayMsFromMessage(message: string) {
    const match = message.match(/retry\s+in\s+(\d+)\s*seconds?/i);
    if (!match) return null;
    const seconds = Number(match[1]);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
  }

  async analyzeWithGemini(jobTitle: string, jobDescription: string) {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
      
      const prompt = `
You are a Senior Full Stack Engineer (NestJS, React). Analyze this Upwork job and decide if it is an "easy/short" job.

Job Title: ${jobTitle}
Job Description: ${jobDescription}

Return ONLY valid JSON (no markdown) with exactly these keys:
{
  "doable": "YES" | "NO",
  "complexity": number, 
  "estimated_days": number,
  "why": string,
  "roadmap": [string, string, string, string]
}

Rules:
- complexity is 1..10.
- estimated_days is total work days (not hours).
- If the job likely takes months, set estimated_days >= 60.
- If requirements are unclear or too broad, doable should be NO.
      `;

      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= this.GEMINI_MAX_ATTEMPTS; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const raw = result.response.text();

          const jsonTextMatch = raw.match(/\{[\s\S]*\}/);
          const jsonText = jsonTextMatch ? jsonTextMatch[0] : raw;
          const parsed = JSON.parse(jsonText);

          const doable = String(parsed.doable || '').toUpperCase() === 'YES';
          const complexity = Number(parsed.complexity);
          const estimatedDays = Number(parsed.estimated_days);

          const accept =
            doable &&
            Number.isFinite(complexity) &&
            Number.isFinite(estimatedDays) &&
            complexity <= this.MAX_COMPLEXITY &&
            estimatedDays <= this.MAX_DAYS;

          return {
            raw,
            doable: doable ? 'YES' : 'NO',
            complexity,
            estimated_days: estimatedDays,
            why: String(parsed.why ?? ''),
            roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap : [],
            accept,
          };
        } catch (e) {
          const err = e as Error;
          lastError = err;

          const message = String((err as any)?.message ?? err);
          const isRateLimit = message.includes('429') || /too\s+many\s+requests/i.test(message);
          if (!isRateLimit || attempt === this.GEMINI_MAX_ATTEMPTS) {
            throw err;
          }

          const retryAfterMs = this.getRetryDelayMsFromMessage(message);
          const delayMs = retryAfterMs ?? this.GEMINI_BASE_DELAY_MS * attempt;
          this.logger.warn(`Gemini rate limited (attempt ${attempt}/${this.GEMINI_MAX_ATTEMPTS}). Retrying in ${delayMs}ms`);
          await this.sleep(delayMs);
        }
      }

      throw lastError ?? new Error('Gemini request failed.');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Gemini analyze error: ${err.message}`, err.stack);
      throw new Error(`Failed to analyze job via Gemini: ${err.message}`);
    }
  }

  async analyzeBatch(jobs: Array<{ title: string; description: string }>) {
    if (!jobs.length) return [];

    const batchPrompt = `
You are a Senior Full Stack Engineer (NestJS, React). Analyze each Upwork job and decide if it is an "easy/short" job.

${jobs.map((job, i) => `Job ${i + 1}:\nTitle: ${job.title}\nDescription: ${job.description}\n---`).join('\n')}

Return ONLY valid JSON (no markdown) with exactly this structure:
{
  "results": [
    {
      "doable": "YES" | "NO",
      "complexity": number,
      "estimated_days": number,
      "why": string,
      "roadmap": [string, string, string, string]
    },
    ... // one object per job in order
  ]
}

Rules:
- complexity is 1..10.
- estimated_days is total work days (not hours).
- If the job likely takes months, set estimated_days >= 60.
- If requirements are unclear or too broad, doable should be NO.
- One result per input job, in the same order.
`;

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= this.GEMINI_MAX_ATTEMPTS; attempt++) {
        try {
          const result = await model.generateContent(batchPrompt);
          const raw = result.response.text();

          const jsonTextMatch = raw.match(/\{[\s\S]*\}/);
          const jsonText = jsonTextMatch ? jsonTextMatch[0] : raw;
          const parsed = JSON.parse(jsonText);

          if (!Array.isArray(parsed.results)) throw new Error('Invalid batch response: missing results array');

          const processed = parsed.results.map((item: any, idx: number) => {
            const doable = String(item.doable || '').toUpperCase() === 'YES';
            const complexity = Number(item.complexity);
            const estimatedDays = Number(item.estimated_days);

            const accept =
              doable &&
              Number.isFinite(complexity) &&
              Number.isFinite(estimatedDays) &&
              complexity <= this.MAX_COMPLEXITY &&
              estimatedDays <= this.MAX_DAYS;

            return {
              raw: JSON.stringify(item),
              doable: doable ? 'YES' : 'NO',
              complexity,
              estimated_days: estimatedDays,
              why: String(item.why ?? ''),
              roadmap: Array.isArray(item.roadmap) ? item.roadmap : [],
              accept,
            };
          });

          return processed;
        } catch (e) {
          const err = e as Error;
          lastError = err;

          const message = String((err as any)?.message ?? err);
          const isRateLimit = message.includes('429') || /too\s+many\s+requests/i.test(message);
          if (!isRateLimit || attempt === this.GEMINI_MAX_ATTEMPTS) {
            throw err;
          }

          const retryAfterMs = this.getRetryDelayMsFromMessage(message);
          const delayMs = retryAfterMs ?? this.GEMINI_BASE_DELAY_MS * attempt;
          this.logger.warn(`Gemini batch rate limited (attempt ${attempt}/${this.GEMINI_MAX_ATTEMPTS}). Retrying in ${delayMs}ms`);
          await this.sleep(delayMs);
        }
      }

      throw lastError ?? new Error('Gemini batch request failed.');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Gemini batch analyze error: ${err.message}`, err.stack);
      throw new Error(`Failed to analyze batch via Gemini: ${err.message}`);
    }
  }

  async appendToGoogleSheet(jobLink: string, analysis: Record<string, unknown>) {
    const auth = new google.auth.GoogleAuth({
      keyFile: 'upwork-tool-487609-8d2afa1af073.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toISOString();
    const rows: Array<[string, string]> = [
      ['timestamp', timestamp],
      ['job_link', jobLink],
      ...Object.entries(analysis).map(([key, value]): [string, string] => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: this.sheetRange,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    });
  }
}
