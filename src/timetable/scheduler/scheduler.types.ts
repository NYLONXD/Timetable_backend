// src/timetable/scheduler/scheduler.types.ts
// Input and output of the timetable scheduler. Plain data with string ids and no Mongoose, so
// the scheduler can be tested on its own and later swapped for an external solver.

export type RoomType = 'lecture' | 'lab' | 'seminar';

export interface DayPeriod {
  day: string;
  period: number; // 1-based
}

export interface SchedulerSection {
  id: string;
  batches: string[]; // empty = the section never splits
  strength?: number;
}

export interface SchedulerTeacher {
  id: string;
  name?: string; // for messages
  maxPerDay?: number;
  maxPerWeek?: number;
  unavailable: DayPeriod[];
  preferred: DayPeriod[];
}

export interface SchedulerRoom {
  id: string;
  type: RoomType;
  capacity: number;
}

// A period already taken outside this timetable, e.g. by another department's active timetable
export interface BusyPeriod extends DayPeriod {
  teacherId?: string;
  roomId?: string;
}

// One assignment: `perWeek` sessions, each `length` consecutive periods long
export interface ClassRequest {
  id: string;
  label: string; // for messages, e.g. "Algorithms (CSE-A) with Dr. Rao"
  sectionIds: string[];
  batch?: string;
  teacherId: string;
  needsLab: boolean; // lab subjects use lab rooms; everything else uses non-lab rooms
  roomId?: string; // pinned room
  studentCount?: number; // overrides the size worked out from the sections or batch
  perWeek: number;
  length: number;
  hard: boolean;
  priority: number;
  parallelGroup?: string;
}

export interface SchedulerInput {
  days: string[];
  periodsPerDay: number;
  breakPeriods: number[]; // lunch included
  maxConsecutive: number;
  sections: SchedulerSection[];
  teachers: SchedulerTeacher[];
  rooms: SchedulerRoom[]; // empty = schedule without rooms
  classes: ClassRequest[];
  busy: BusyPeriod[];
}

// One period of one class
export interface Placement extends DayPeriod {
  classId: string;
  roomId?: string;
}

export interface Problem {
  type: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface SchedulerResult {
  placements: Placement[];
  problems: Problem[];
}
