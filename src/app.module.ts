import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AppController, JobsController],
  providers: [AppService, JobsService],
})
export class AppModule {}
