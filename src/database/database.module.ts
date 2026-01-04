// src/database/database.module.ts
// Purpose: Connect NestJS to MongoDB using Mongoose

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/timetable',
        // REMOVED: useNewUrlParser and useUnifiedTopology (deprecated in MongoDB driver v4+)
        autoIndex: true, // Create indexes automatically
      }),
    }),
  ],
})
export class DatabaseModule {}