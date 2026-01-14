// src/teacher-availability/teacher-availability.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { TeacherAvailabilityService } from './teacher-availability.service';
import { CreateTeacherAvailabilityDto } from './dto/create-teacher-availability.dto';
import { UpdateTeacherAvailabilityDto } from './dto/update-teacher-availability.dto';

@Controller('teacher-availability')
export class TeacherAvailabilityController {
  constructor(private readonly availabilityService: TeacherAvailabilityService) {}

  @Post()
  create(@Body() createDto: CreateTeacherAvailabilityDto) {
    return this.availabilityService.create(createDto);
  }

  @Get()
  findAll(@Query('teacherId') teacherId?: string) {
    if (teacherId) {
      return this.availabilityService.findByTeacher(teacherId);
    }
    return this.availabilityService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.availabilityService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateTeacherAvailabilityDto) {
    return this.availabilityService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.availabilityService.remove(id);
  }
}