import { Controller, Post, Body } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('process')
  async processJobs(@Body() jobs: any[]) {
    const results: any[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE);
      try {
        const analyses = await this.jobsService.analyzeBatch(batch);

        for (let j = 0; j < batch.length; j++) {
          const job = batch[j];
          const analysis = analyses[j];

          if (!analysis) {
            results.push({ title: job.title, status: 'Failed', reason: 'Missing analysis' });
            continue;
          }

          if (!analysis.accept) {
            results.push({
              title: job.title,
              status: 'Skipped',
              reason: `Not easy/short: doable=${analysis.doable}, complexity=${analysis.complexity}, estimated_days=${analysis.estimated_days}`,
            });
            continue;
          }

          await this.jobsService.appendToGoogleSheet(job.link, analysis);
          results.push({ title: job.title, status: 'Success' });
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        for (const job of batch) {
          console.error(`Error processing batch starting at index ${i}:`, error.message);
          results.push({ title: job.title, status: 'Failed', reason: error.message });
        }
      }
    }

    return { message: 'Processing completed', detail: results };
  }
}
