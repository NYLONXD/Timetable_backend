// src/terms/terms.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TermsController } from './terms.controller';
import { TermsService } from './terms.service';
import { Term, TermSchema } from './schemas/term.schema';
import {
  Generation,
  GenerationSchema,
} from '../timetable/schemas/generation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Term.name, schema: TermSchema },
      // Read-only here: timetable counts, and locking the schedule once timetables exist
      { name: Generation.name, schema: GenerationSchema },
    ]),
  ],
  controllers: [TermsController],
  providers: [TermsService],
  exports: [TermsService],
})
export class TermsModule {}
