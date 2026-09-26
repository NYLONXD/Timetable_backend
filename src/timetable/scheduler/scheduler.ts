// src/timetable/scheduler/scheduler.ts
// Greedy timetable scheduler. Places the hardest classes first, each session in the best free
// slot it can find, and never backtracks.
//
// Hard rules, never broken:
//   - a teacher teaches one class at a time, only when available, within daily and weekly limits
//   - students attend one class at a time, and never during breaks
//   - a room holds one class at a time, of the right type (lab or not) and with enough seats
//   - no more than maxConsecutive classes back to back. A single session longer than that
//     (a 3-period lab, say) is allowed, but then nothing may sit directly next to it.
// Soft preferences, used to choose between valid slots: spread a class's sessions over
// different days, and use periods its teacher marked as preferred.
//
// Students are tracked as "atoms": one per section, or one per batch if the section is split
// into batches. A whole-section class occupies all of the section's atoms, a batch class only
// its batch. Two classes clash when they share an atom.

import {
  ClassRequest,
  DayPeriod,
  Placement,
  Problem,
  SchedulerInput,
  SchedulerResult,
  SchedulerRoom,
  SchedulerSection,
  SchedulerTeacher,
} from './scheduler.types';

// A class plus what it needs
interface Member {
  request: ClassRequest;
  atoms: string[];
  size: number;
  rooms: SchedulerRoom[]; // usable rooms, smallest first (unused when scheduling without rooms)
}

// Classes that must be placed together at the same times (a parallel group), or a lone class
interface Unit {
  members: Member[];
  atoms: string[];
  perWeek: number;
  length: number;
  hard: boolean;
  priority: number;
}

interface Candidate {
  day: number;
  start: number;
  score: number;
}

export function schedule(
  input: SchedulerInput,
  random: () => number = Math.random,
): SchedulerResult {
  return new Scheduler(input, random).run();
}

class Scheduler {
  private readonly periods: number;
  private readonly breaks: Set<number>;
  private readonly useRooms: boolean;
  private readonly sections: Map<string, SchedulerSection>;
  private readonly teachers: Map<string, SchedulerTeacher>;
  private readonly problems: Problem[] = [];
  private readonly placements: Placement[] = [];

  // Occupancy by slot index (day * periods + period - 1). 1 = taken.
  private readonly atomBusy = new Map<string, Uint8Array>();
  private readonly teacherBusy = new Map<string, Uint8Array>(); // teaching or unavailable
  private readonly roomBusy = new Map<string, Uint8Array>();
  private readonly teacherDayLoad = new Map<string, number[]>();
  private readonly teacherWeekLoad = new Map<string, number>();
  private readonly preferred = new Map<string, Set<number>>();

  constructor(
    private readonly input: SchedulerInput,
    private readonly random: () => number,
  ) {
    this.periods = input.periodsPerDay;
    this.breaks = new Set(input.breakPeriods);
    this.useRooms = input.rooms.length > 0;
    this.sections = new Map(input.sections.map((s) => [s.id, s]));
    this.teachers = new Map(input.teachers.map((t) => [t.id, t]));
  }

  run(): SchedulerResult {
    this.loadFixedBookings();
    const units = this.buildUnits();
    // Hard before soft, then the user's priority, then the classes with the least room to
    // manoeuvre (so a teacher free only three periods a week gets them), then the biggest
    const slack = new Map(units.map((u) => [u, this.slack(u)]));
    units.sort(
      (a, b) =>
        Number(b.hard) - Number(a.hard) ||
        b.priority - a.priority ||
        slack.get(a)! - slack.get(b)! ||
        this.difficulty(b) - this.difficulty(a),
    );
    for (const unit of units) {
      this.placeUnit(unit);
    }
    return { placements: this.placements, problems: this.problems };
  }

  // Teacher unavailability, and periods other timetables already use
  private loadFixedBookings() {
    for (const teacher of this.input.teachers) {
      const busy = this.grid(this.teacherBusy, teacher.id);
      for (const i of this.indexes(teacher.unavailable)) busy[i] = 1;
      this.preferred.set(teacher.id, new Set(this.indexes(teacher.preferred)));
    }

    const teaching = new Set<string>();
    for (const booking of this.input.busy) {
      const [i] = this.indexes([booking]);
      if (i === undefined) continue;
      if (booking.teacherId && !teaching.has(`${booking.teacherId}|${i}`)) {
        teaching.add(`${booking.teacherId}|${i}`);
        this.grid(this.teacherBusy, booking.teacherId)[i] = 1;
        this.addLoad(booking.teacherId, Math.floor(i / this.periods), 1);
      }
      if (booking.roomId) this.grid(this.roomBusy, booking.roomId)[i] = 1;
    }

    this.warnAboutWeeklyOverload();
  }

  private warnAboutWeeklyOverload() {
    const assigned = new Map<string, number>();
    for (const c of this.input.classes) {
      assigned.set(
        c.teacherId,
        (assigned.get(c.teacherId) ?? 0) + c.perWeek * c.length,
      );
    }
    for (const teacher of this.input.teachers) {
      const total =
        (assigned.get(teacher.id) ?? 0) +
        (this.teacherWeekLoad.get(teacher.id) ?? 0);
      if (teacher.maxPerWeek && total > teacher.maxPerWeek) {
        this.problems.push({
          type: 'teacher_overload',
          severity: 'warning',
          message: `${teacher.name ?? 'A teacher'} has ${total} periods a week to teach (other active timetables included) but a limit of ${teacher.maxPerWeek}.`,
        });
      }
    }
  }

  private buildUnits(): Unit[] {
    if (!this.useRooms && this.input.classes.length > 0) {
      this.problems.push({
        type: 'no_rooms',
        severity: 'warning',
        message:
          'No rooms are set up, so classes were scheduled without rooms.',
      });
    }

    const units: Unit[] = [];
    const groups = new Map<string, Member[]>();
    for (const request of this.input.classes) {
      const member = this.toMember(request);
      if (!member) continue;
      if (request.parallelGroup) {
        groups.set(request.parallelGroup, [
          ...(groups.get(request.parallelGroup) ?? []),
          member,
        ]);
      } else {
        units.push(this.toUnit([member]));
      }
    }

    for (const [label, members] of groups) {
      const problem = this.groupProblem(members);
      if (problem) {
        this.problems.push({
          type: 'invalid_parallel_group',
          severity: 'warning',
          message: `Parallel group ${label}: ${problem}, so its classes were scheduled separately.`,
        });
        units.push(...members.map((m) => this.toUnit([m])));
      } else {
        units.push(this.toUnit(members));
      }
    }
    return units;
  }

  // null (with a problem recorded) when the class can never be placed
  private toMember(request: ClassRequest): Member | null {
    const skip = (reason: string) => {
      this.problems.push({
        type: 'invalid_class',
        severity: 'error',
        message: `Skipped ${request.label}: ${reason}.`,
      });
      return null;
    };

    const atoms: string[] = [];
    for (const id of request.sectionIds) {
      const section = this.sections.get(id);
      if (!section) return skip('its section is missing');
      if (request.batch) {
        if (request.sectionIds.length > 1)
          return skip('a batch needs a single section');
        if (!section.batches.includes(request.batch)) {
          return skip(`its section has no batch ${request.batch}`);
        }
        atoms.push(`${id}:${request.batch}`);
      } else if (section.batches.length > 0) {
        atoms.push(...section.batches.map((b) => `${id}:${b}`));
      } else {
        atoms.push(id);
      }
    }
    if (request.length > this.periods) {
      return skip(`a ${request.length}-period session doesn't fit in a day`);
    }

    const size = this.sizeOf(request);
    let rooms: SchedulerRoom[] = [];
    if (this.useRooms) {
      if (request.roomId) {
        const room = this.input.rooms.find((r) => r.id === request.roomId);
        if (!room) return skip('its pinned room no longer exists');
        if (room.capacity < size) {
          return skip(
            `its pinned room seats ${room.capacity}, fewer than its ${size} students`,
          );
        }
        rooms = [room];
      } else {
        rooms = this.input.rooms
          .filter(
            (r) =>
              (r.type === 'lab') === request.needsLab && r.capacity >= size,
          )
          .sort((a, b) => a.capacity - b.capacity);
        if (rooms.length === 0) {
          return skip(
            `no ${request.needsLab ? 'lab' : 'non-lab'} room seats ${size} students`,
          );
        }
      }
    }
    return { request, atoms, size, rooms };
  }

  private sizeOf(request: ClassRequest): number {
    if (request.studentCount) return request.studentCount;
    const sections = request.sectionIds.map((id) => this.sections.get(id));
    if (request.batch) {
      const section = sections[0];
      return section?.strength
        ? Math.ceil(section.strength / section.batches.length)
        : 0;
    }
    return sections.reduce((sum, s) => sum + (s?.strength ?? 0), 0);
  }

  private groupProblem(members: Member[]): string | null {
    const [first] = members;
    if (
      members.some(
        (m) =>
          m.request.perWeek !== first.request.perWeek ||
          m.request.length !== first.request.length,
      )
    ) {
      return 'its classes need the same sessions per week and session length';
    }
    const teachers = members.map((m) => m.request.teacherId);
    if (new Set(teachers).size !== teachers.length) {
      return 'the same teacher is in more than one of its classes';
    }
    const pinned = members.map((m) => m.request.roomId).filter(Boolean);
    if (new Set(pinned).size !== pinned.length) {
      return 'two of its classes are pinned to the same room';
    }
    return null;
  }

  private toUnit(members: Member[]): Unit {
    const { perWeek, length } = members[0].request;
    return {
      members,
      atoms: [...new Set(members.flatMap((m) => m.atoms))],
      perWeek,
      length,
      hard: members.some((m) => m.request.hard),
      priority: Math.max(...members.map((m) => m.request.priority)),
    };
  }

  // Periods (outside breaks) when all of the unit's teachers are free, minus the periods the
  // unit needs
  private slack(unit: Unit): number {
    let free = 0;
    for (let i = 0; i < this.input.days.length * this.periods; i++) {
      if (this.breaks.has((i % this.periods) + 1)) continue;
      if (
        unit.members.every(
          (m) => !this.teacherBusy.get(m.request.teacherId)?.[i],
        )
      )
        free++;
    }
    return free - unit.perWeek * unit.length;
  }

  // Rough measure of how hard a unit is to fit: periods needed times resources involved
  private difficulty(unit: Unit) {
    return (
      unit.perWeek * unit.length * (unit.members.length + unit.atoms.length)
    );
  }

  private placeUnit(unit: Unit) {
    const daysUsed = new Set<number>();
    let placed = 0;
    let roomShortage = false;

    for (let session = 0; session < unit.perWeek; session++) {
      roomShortage = false;
      let done = false;
      for (const candidate of this.candidates(unit, daysUsed)) {
        const rooms = this.pickRooms(unit, candidate);
        if (!rooms) {
          roomShortage = true;
          continue;
        }
        this.commit(unit, candidate, rooms);
        daysUsed.add(candidate.day);
        done = true;
        break;
      }
      if (!done) break;
      placed++;
    }

    if (placed < unit.perWeek) {
      const hint = roomShortage
        ? ' No room of the right type and size was free at the remaining times.'
        : '';
      for (const { request } of unit.members) {
        this.problems.push({
          type: 'insufficient_slots',
          severity: request.hard ? 'error' : 'warning',
          message: `Could not place all ${unit.perWeek} sessions for ${request.label}. Only placed ${placed}/${unit.perWeek} sessions.${hint}`,
        });
      }
    }
  }

  // Valid start slots for the next session, best first. Ties keep a random day order and
  // earlier periods first.
  private candidates(unit: Unit, daysUsed: Set<number>): Candidate[] {
    const found: Candidate[] = [];
    for (const day of this.shuffle([...this.input.days.keys()])) {
      for (let start = 1; start + unit.length - 1 <= this.periods; start++) {
        if (this.fits(unit, day, start)) {
          found.push({
            day,
            start,
            score: this.score(unit, day, start, daysUsed),
          });
        }
      }
    }
    return found.sort((a, b) => b.score - a.score); // stable sort keeps ties in order
  }

  private fits(unit: Unit, day: number, start: number): boolean {
    const end = start + unit.length - 1;
    for (let period = start; period <= end; period++) {
      if (this.breaks.has(period)) return false;
      const i = this.index(day, period);
      if (unit.atoms.some((a) => this.atomBusy.get(a)?.[i])) return false;
      if (
        unit.members.some((m) => this.teacherBusy.get(m.request.teacherId)?.[i])
      )
        return false;
    }

    for (const { request } of unit.members) {
      const teacher = this.teachers.get(request.teacherId);
      const dayLoad = this.teacherDayLoad.get(request.teacherId)?.[day] ?? 0;
      const weekLoad = this.teacherWeekLoad.get(request.teacherId) ?? 0;
      if (teacher?.maxPerDay && dayLoad + unit.length > teacher.maxPerDay)
        return false;
      if (teacher?.maxPerWeek && weekLoad + unit.length > teacher.maxPerWeek)
        return false;
    }

    const limit = Math.max(this.input.maxConsecutive, unit.length);
    return unit.atoms.every(
      (atom) => this.runLength(atom, day, start, end) <= limit,
    );
  }

  // Length of the unbroken run of classes that periods start..end would join, for one atom.
  // Breaks end a run rather than extend it.
  private runLength(
    atom: string,
    day: number,
    start: number,
    end: number,
  ): number {
    const busy = this.atomBusy.get(atom);
    const isClass = (period: number) =>
      !this.breaks.has(period) && !!busy?.[this.index(day, period)];
    let first = start;
    while (first > 1 && isClass(first - 1)) first--;
    let last = end;
    while (last < this.periods && isClass(last + 1)) last++;
    return last - first + 1;
  }

  private score(
    unit: Unit,
    day: number,
    start: number,
    daysUsed: Set<number>,
  ): number {
    let score = daysUsed.has(day) ? -10 : 0; // prefer a day this class isn't on yet
    for (const { request } of unit.members) {
      const preferred = this.preferred.get(request.teacherId);
      if (!preferred?.size) continue;
      let all = true;
      for (let p = start; p < start + unit.length; p++) {
        all &&= preferred.has(this.index(day, p));
      }
      if (all) score += 3;
    }
    return score;
  }

  // A distinct free room for each member, or null. Larger classes pick first so small ones
  // don't take the big rooms. Returns an empty map when scheduling without rooms.
  private pickRooms(
    unit: Unit,
    { day, start }: Candidate,
  ): Map<string, string> | null {
    const chosen = new Map<string, string>();
    if (!this.useRooms) return chosen;
    const taken = new Set<string>();
    for (const member of [...unit.members].sort((a, b) => b.size - a.size)) {
      const room = member.rooms.find(
        (r) =>
          !taken.has(r.id) &&
          this.isFree(this.roomBusy.get(r.id), day, start, unit.length),
      );
      if (!room) return null;
      taken.add(room.id);
      chosen.set(member.request.id, room.id);
    }
    return chosen;
  }

  private commit(
    unit: Unit,
    { day, start }: Candidate,
    rooms: Map<string, string>,
  ) {
    for (let period = start; period < start + unit.length; period++) {
      const i = this.index(day, period);
      for (const atom of unit.atoms) this.grid(this.atomBusy, atom)[i] = 1;
      for (const { request } of unit.members) {
        this.grid(this.teacherBusy, request.teacherId)[i] = 1;
        const roomId = rooms.get(request.id);
        if (roomId) this.grid(this.roomBusy, roomId)[i] = 1;
        this.placements.push({
          classId: request.id,
          day: this.input.days[day],
          period,
          ...(roomId ? { roomId } : {}),
        });
      }
    }
    for (const { request } of unit.members) {
      this.addLoad(request.teacherId, day, unit.length);
    }
  }

  private addLoad(teacherId: string, day: number, periods: number) {
    const dayLoad =
      this.teacherDayLoad.get(teacherId) ?? this.input.days.map(() => 0);
    dayLoad[day] += periods;
    this.teacherDayLoad.set(teacherId, dayLoad);
    this.teacherWeekLoad.set(
      teacherId,
      (this.teacherWeekLoad.get(teacherId) ?? 0) + periods,
    );
  }

  private isFree(
    busy: Uint8Array | undefined,
    day: number,
    start: number,
    length: number,
  ) {
    for (let period = start; period < start + length; period++) {
      if (busy?.[this.index(day, period)]) return false;
    }
    return true;
  }

  private grid(map: Map<string, Uint8Array>, key: string): Uint8Array {
    let grid = map.get(key);
    if (!grid) {
      grid = new Uint8Array(this.input.days.length * this.periods);
      map.set(key, grid);
    }
    return grid;
  }

  private index(day: number, period: number) {
    return day * this.periods + period - 1;
  }

  // Slot indexes of the given day/periods, skipping days or periods outside the timetable
  private indexes(dayPeriods: DayPeriod[]): number[] {
    return dayPeriods.flatMap(({ day, period }) => {
      const d = this.input.days.indexOf(day);
      return d === -1 || period < 1 || period > this.periods
        ? []
        : [this.index(d, period)];
    });
  }

  private shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
