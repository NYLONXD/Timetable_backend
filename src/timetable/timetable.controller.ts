// src/timetable/timetable.controller.ts
// UPDATED: Changed slot update endpoint parameter

import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { TimetableService } from './timetable.service';
import { GenerateTimetableDto } from './dto/generate-timetable.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { UpdateGenerationDto } from './dto/update-generation.dto';

@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  // Generate new timetable
  @Post('generate')
  generate(@Body() generateDto: GenerateTimetableDto) {
    return this.timetableService.generate(generateDto);
  }

  // Get all generations
  @Get()
  findAll() {
    return this.timetableService.findAll();
  }

  // Get specific generation (includes slots and conflicts)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timetableService.findOne(id);
  }

  // Update generation metadata
  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateGenerationDto) {
    return this.timetableService.update(id, updateDto);
  }

  // Delete generation (also deletes all slots and conflicts)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.timetableService.remove(id);
  }

  // Update single slot
  // CHANGED: Now accepts generationId in path and slotId in body
  @Put(':id/slot')
  updateSlot(@Param('id') generationId: string, @Body() updateSlotDto: UpdateSlotDto) {
    return this.timetableService.updateSlot(generationId, updateSlotDto);
  }

  // Activate generation
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.timetableService.activate(id);
  }
}