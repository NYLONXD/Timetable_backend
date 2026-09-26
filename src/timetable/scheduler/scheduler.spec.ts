import { schedule } from './scheduler';
import {
  BusyPeriod,
  ClassRequest,
  RoomType,
  SchedulerInput,
  SchedulerResult,
  SchedulerRoom,
  SchedulerSection,
  SchedulerTeacher,
} from './scheduler.types';

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Deterministic Math.random replacement (mulberry32)
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seq = 0;
const newSection = (
  batches: string[] = [],
  strength = 60,
): SchedulerSection => ({
  id: `section${++seq}`,
  batches,
  strength,
});
const newTeacher = (
  extra: Partial<SchedulerTeacher> = {},
): SchedulerTeacher => ({
  id: `teacher${++seq}`,
  unavailable: [],
  preferred: [],
  ...extra,
});
const newRoom = (type: RoomType = 'lecture', capacity = 60): SchedulerRoom => ({
  id: `room${++seq}`,
  type,
  capacity,
});
const newClass = (
  sections: SchedulerSection[],
  teacher: SchedulerTeacher,
  extra: Partial<ClassRequest> = {},
): ClassRequest => ({
  id: `class${++seq}`,
  label: `Class ${seq}`,
  sectionIds: sections.map((s) => s.id),
  teacherId: teacher.id,
  needsLab: false,
  perWeek: 1,
  length: 1,
  hard: true,
  priority: 5,
  ...extra,
});

function run(input: Partial<SchedulerInput>, seed = 1) {
  const full: SchedulerInput = {
    days: WEEK,
    periodsPerDay: 6,
    breakPeriods: [],
    maxConsecutive: 3,
    sections: [],
    teachers: [],
    rooms: [],
    classes: [],
    busy: [],
    ...input,
  };
  return { input: full, result: schedule(full, seeded(seed)) };
}

const periodsOf = (result: SchedulerResult, classId: string) =>
  result.placements
    .filter((p) => p.classId === classId)
    .map((p) => `${p.day.slice(0, 3)} ${p.period}`);

// Every hard rule, checked independently of the scheduler's own bookkeeping
function violations({
  input,
  result,
}: {
  input: SchedulerInput;
  result: SchedulerResult;
}) {
  const found: string[] = [];
  const classes = new Map(input.classes.map((c) => [c.id, c]));
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  const rooms = new Map(input.rooms.map((r) => [r.id, r]));
  const breaks = new Set(input.breakPeriods);
  const atomsOf = (c: ClassRequest) =>
    c.sectionIds.flatMap((id) => {
      const s = sections.get(id)!;
      if (c.batch) return [`${id}:${c.batch}`];
      return s.batches.length ? s.batches.map((b) => `${id}:${b}`) : [id];
    });
  const unavailable = new Set(
    input.teachers.flatMap((t) =>
      t.unavailable.map((u) => `${t.id}|${u.day}|${u.period}`),
    ),
  );
  const external = new Set(
    input.busy.flatMap((b: BusyPeriod) => [
      ...(b.teacherId ? [`${b.teacherId}|${b.day}|${b.period}`] : []),
      ...(b.roomId ? [`${b.roomId}|${b.day}|${b.period}`] : []),
    ]),
  );

  const teacherAt = new Map<string, string>();
  const roomAt = new Map<string, string>();
  const atomAt = new Map<string, ClassRequest[]>();
  const load = new Map<string, number>(); // teacher|day and teacher, bookings elsewhere included
  const placed = new Map<string, number>(); // same keys, this timetable only
  for (const b of input.busy) {
    if (!b.teacherId) continue;
    load.set(
      `${b.teacherId}|${b.day}`,
      (load.get(`${b.teacherId}|${b.day}`) ?? 0) + 1,
    );
    load.set(b.teacherId, (load.get(b.teacherId) ?? 0) + 1);
  }

  for (const p of result.placements) {
    const c = classes.get(p.classId)!;
    const at = `${p.day}|${p.period}`;
    if (breaks.has(p.period)) found.push(`${c.label} during a break`);
    if (unavailable.has(`${c.teacherId}|${at}`))
      found.push(`${c.label} while its teacher is unavailable`);
    if (external.has(`${c.teacherId}|${at}`))
      found.push(`${c.label} while its teacher is booked elsewhere`);
    if (teacherAt.has(`${c.teacherId}|${at}`))
      found.push(`teacher of ${c.label} double-booked at ${at}`);
    teacherAt.set(`${c.teacherId}|${at}`, c.id);
    for (const key of [`${c.teacherId}|${p.day}`, c.teacherId]) {
      load.set(key, (load.get(key) ?? 0) + 1);
      placed.set(key, (placed.get(key) ?? 0) + 1);
    }

    if (p.roomId) {
      const room = rooms.get(p.roomId)!;
      if (roomAt.has(`${p.roomId}|${at}`))
        found.push(`room ${p.roomId} double-booked at ${at}`);
      if (external.has(`${p.roomId}|${at}`))
        found.push(`room ${p.roomId} booked elsewhere at ${at}`);
      roomAt.set(`${p.roomId}|${at}`, c.id);
      if (!c.roomId && (room.type === 'lab') !== c.needsLab)
        found.push(`${c.label} in a ${room.type} room`);
    }

    for (const atom of atomsOf(c)) {
      const others = atomAt.get(`${atom}|${at}`) ?? [];
      // Only members of one parallel group (e.g. alternative electives) may share students
      if (
        others.some(
          (o) => !o.parallelGroup || o.parallelGroup !== c.parallelGroup,
        )
      ) {
        found.push(`students ${atom} double-booked at ${at}`);
      }
      atomAt.set(`${atom}|${at}`, [...others, c]);
    }
  }

  // Over a limit only counts if this timetable added classes (bookings elsewhere may already exceed it)
  const overLimit = (key: string, limit?: number) =>
    !!limit && (placed.get(key) ?? 0) > 0 && (load.get(key) ?? 0) > limit;
  for (const t of input.teachers) {
    for (const day of input.days) {
      if (overLimit(`${t.id}|${day}`, t.maxPerDay))
        found.push(`${t.id} over daily limit on ${day}`);
    }
    if (overLimit(t.id, t.maxPerWeek)) found.push(`${t.id} over weekly limit`);
  }

  // Back-to-back runs: longer than maxConsecutive only when the run is one single session
  for (const [key] of atomAt) {
    const [atom, day] = key.split('|');
    let run: ClassRequest[][] = [];
    const flush = () => {
      const ids = new Set(run.flat().map((c) => c.id));
      const single =
        run.length > 0 &&
        ids.size === run[0].length &&
        run.every((cs) => cs.every((c) => c.length === run.length));
      if (run.length > input.maxConsecutive && !single)
        found.push(`${atom} has ${run.length} classes in a row on ${day}`);
      run = [];
    };
    for (let period = 1; period <= input.periodsPerDay; period++) {
      const here = atomAt.get(`${atom}|${day}|${period}`);
      if (here && !breaks.has(period)) run.push(here);
      else flush();
    }
    flush();
  }
  return [...new Set(found)];
}

describe('schedule', () => {
  describe('rooms', () => {
    it('puts lab subjects in labs and other subjects in lecture rooms, never double-booked', () => {
      const sections = [newSection(), newSection(), newSection()];
      const [labTeacher, t1, t2] = [newTeacher(), newTeacher(), newTeacher()];
      const lab = newRoom('lab', 70);
      const lecture = newRoom('lecture', 70);
      const classes = sections.flatMap((s) => [
        newClass([s], labTeacher, { needsLab: true, length: 2 }),
        newClass([s], t1, { perWeek: 3 }),
        newClass([s], t2, { perWeek: 3 }),
      ]);
      const out = run({
        sections,
        teachers: [labTeacher, t1, t2],
        rooms: [lab, lecture],
        classes,
      });

      expect(violations(out)).toEqual([]);
      for (const p of out.result.placements) {
        const c = classes.find((x) => x.id === p.classId)!;
        expect(p.roomId).toBe(c.needsLab ? lab.id : lecture.id);
      }
    });

    it('picks the smallest room that seats everyone', () => {
      const section = newSection([], 45);
      const teacher = newTeacher();
      const rooms = [
        newRoom('lecture', 120),
        newRoom('lecture', 40),
        newRoom('lecture', 50),
      ];
      const c = newClass([section], teacher);
      const { result } = run({
        sections: [section],
        teachers: [teacher],
        rooms,
        classes: [c],
      });

      expect(result.placements.map((p) => p.roomId)).toEqual([rooms[2].id]);
    });

    it('seats a combined class for the total strength of its sections', () => {
      const [a, b] = [newSection([], 60), newSection([], 60)];
      const teacher = newTeacher();
      const small = newRoom('lecture', 70);
      const hall = newRoom('lecture', 150);
      const c = newClass([a, b], teacher);
      const { result } = run({
        sections: [a, b],
        teachers: [teacher],
        rooms: [small, hall],
        classes: [c],
      });

      expect(result.placements.map((p) => p.roomId)).toEqual([hall.id]);
    });

    it('always uses a pinned room', () => {
      const section = newSection();
      const teacher = newTeacher();
      const rooms = [
        newRoom('lecture', 60),
        newRoom('lecture', 60),
        newRoom('lecture', 60),
      ];
      const c = newClass([section], teacher, {
        perWeek: 4,
        roomId: rooms[1].id,
      });
      const { result } = run({
        sections: [section],
        teachers: [teacher],
        rooms,
        classes: [c],
      });

      expect(new Set(result.placements.map((p) => p.roomId))).toEqual(
        new Set([rooms[1].id]),
      );
      expect(result.placements).toHaveLength(4);
    });

    it('skips a class no room can seat, and says why', () => {
      const section = newSection([], 200);
      const teacher = newTeacher();
      const c = newClass([section], teacher, {
        label: 'Physics (ME-A) with Dr. Iyer',
      });
      const { result } = run({
        sections: [section],
        teachers: [teacher],
        rooms: [newRoom('lecture', 100)],
        classes: [c],
      });

      expect(result.placements).toEqual([]);
      expect(result.problems).toEqual([
        expect.objectContaining({
          type: 'invalid_class',
          severity: 'error',
          message:
            'Skipped Physics (ME-A) with Dr. Iyer: no non-lab room seats 200 students.',
        }),
      ]);
    });

    it('schedules without rooms, with a warning, when none are set up', () => {
      const section = newSection();
      const teacher = newTeacher();
      const { result } = run({
        sections: [section],
        teachers: [teacher],
        classes: [newClass([section], teacher, { perWeek: 2 })],
      });

      expect(result.placements).toHaveLength(2);
      expect(result.placements.every((p) => p.roomId === undefined)).toBe(true);
      expect(result.problems.map((p) => p.type)).toEqual(['no_rooms']);
    });
  });

  describe('batches, combined classes and parallel groups', () => {
    it('runs the batches of a section in parallel, and never overlaps a whole-section class with a batch', () => {
      const section = newSection(['B1', 'B2']);
      const [t1, t2, t3] = [newTeacher(), newTeacher(), newTeacher()];
      const labB1 = newClass([section], t1, {
        batch: 'B1',
        needsLab: true,
        length: 2,
        parallelGroup: 'LAB',
      });
      const labB2 = newClass([section], t2, {
        batch: 'B2',
        needsLab: true,
        length: 2,
        parallelGroup: 'LAB',
      });
      const lecture = newClass([section], t3, { perWeek: 5 });
      const out = run({
        sections: [section],
        teachers: [t1, t2, t3],
        rooms: [newRoom('lab', 30), newRoom('lab', 30), newRoom('lecture', 60)],
        classes: [labB1, labB2, lecture],
      });

      expect(violations(out)).toEqual([]);
      expect(periodsOf(out.result, labB1.id)).toHaveLength(2);
      expect(periodsOf(out.result, labB1.id)).toEqual(
        periodsOf(out.result, labB2.id),
      );
      expect(periodsOf(out.result, lecture.id)).toHaveLength(5);
    });

    it('lets batch classes of one section share a period even without a parallel group', () => {
      const section = newSection(['B1', 'B2']);
      const [t1, t2] = [newTeacher(), newTeacher()];
      // One free period, so both batches must use it at once
      const b1 = newClass([section], t1, { batch: 'B1' });
      const b2 = newClass([section], t2, { batch: 'B2' });
      const out = run({
        days: ['Monday'],
        periodsPerDay: 1,
        sections: [section],
        teachers: [t1, t2],
        classes: [b1, b2],
      });

      expect(out.result.placements).toHaveLength(2);
      expect(violations(out)).toEqual([]);
    });

    it('schedules an elective basket at the same times for all its sections', () => {
      const [a, b] = [newSection(), newSection()];
      const teachers = [newTeacher(), newTeacher(), newTeacher(), newTeacher()];
      const electives = teachers.slice(0, 3).map((t) =>
        newClass([a, b], t, {
          perWeek: 3,
          parallelGroup: 'OE-1',
          studentCount: 40,
        }),
      );
      const core = newClass([a], teachers[3], { perWeek: 4 });
      const out = run({
        sections: [a, b],
        teachers,
        rooms: [
          newRoom('lecture', 40),
          newRoom('lecture', 45),
          newRoom('lecture', 50),
          newRoom('lecture', 60),
        ],
        classes: [...electives, core],
      });

      expect(violations(out)).toEqual([]);
      const times = electives.map((e) => periodsOf(out.result, e.id));
      expect(times[0]).toHaveLength(3);
      expect(times[1]).toEqual(times[0]);
      expect(times[2]).toEqual(times[0]);
    });

    it('schedules a parallel group separately, with a warning, when its classes differ in length', () => {
      const section = newSection(['B1', 'B2']);
      const [t1, t2] = [newTeacher(), newTeacher()];
      const b1 = newClass([section], t1, {
        batch: 'B1',
        length: 2,
        parallelGroup: 'LAB',
      });
      const b2 = newClass([section], t2, {
        batch: 'B2',
        length: 3,
        parallelGroup: 'LAB',
      });
      const out = run({
        sections: [section],
        teachers: [t1, t2],
        classes: [b1, b2],
      });

      expect(out.result.problems).toContainEqual(
        expect.objectContaining({
          type: 'invalid_parallel_group',
          severity: 'warning',
        }),
      );
      expect(periodsOf(out.result, b1.id)).toHaveLength(2);
      expect(periodsOf(out.result, b2.id)).toHaveLength(3);
      expect(violations(out)).toEqual([]);
    });
  });

  describe('teachers', () => {
    it('never books a teacher in a period they marked unavailable', () => {
      const section = newSection();
      const teacher = newTeacher({
        unavailable: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'].flatMap(
          (day) => [1, 2, 3, 4, 5, 6].map((period) => ({ day, period })),
        ),
      });
      const c = newClass([section], teacher, { perWeek: 4 });
      const { result } = run({
        sections: [section],
        teachers: [teacher],
        classes: [c],
      });

      expect(result.placements.map((p) => p.day)).toEqual(
        Array(4).fill('Friday'),
      );
    });

    it('keeps each teacher within their daily and weekly limits', () => {
      const sections = [newSection(), newSection(), newSection()];
      const teacher = newTeacher({ maxPerDay: 2, maxPerWeek: 7 });
      const classes = sections.map((s) =>
        newClass([s], teacher, { perWeek: 3 }),
      );
      const out = run({ sections, teachers: [teacher], classes });

      expect(violations(out)).toEqual([]);
      expect(out.result.placements).toHaveLength(7);
      expect(out.result.problems.map((p) => p.type)).toEqual(
        expect.arrayContaining(['teacher_overload', 'insufficient_slots']),
      );
    });

    it('avoids teachers and rooms that other active timetables use, counting that load too', () => {
      const section = newSection();
      const teacher = newTeacher({ maxPerWeek: 4 });
      const room = newRoom();
      const busy: BusyPeriod[] = [
        ...WEEK.map((day) => ({ day, period: 1, teacherId: teacher.id })), // 5 periods elsewhere
        ...WEEK.map((day) => ({ day, period: 2, roomId: room.id })),
      ];
      const c = newClass([section], teacher, { perWeek: 3 });
      const out = run({
        sections: [section],
        teachers: [teacher],
        rooms: [room],
        classes: [c],
        busy,
      });

      expect(violations(out)).toEqual([]);
      // Already at 5 periods elsewhere against a limit of 4, so nothing more fits
      expect(out.result.placements).toEqual([]);

      const relaxed = run({
        sections: [section],
        teachers: [{ ...teacher, maxPerWeek: undefined }],
        rooms: [room],
        classes: [c],
        busy,
      });
      expect(violations(relaxed)).toEqual([]);
      expect(relaxed.result.placements.every((p) => p.period > 2)).toBe(true);
    });

    it('schedules the class whose teacher has the fewest free periods first', () => {
      const section = newSection();
      const busyTeacher = newTeacher({
        unavailable: [1, 3].map((period) => ({ day: 'Monday', period })),
      });
      const freeTeacher = newTeacher();
      // Placed first, the bigger class would take periods 1 and 2 and leave no room for this one
      const constrained = newClass([section], busyTeacher);
      const flexible = newClass([section], freeTeacher, { perWeek: 2 });
      const { result } = run({
        days: ['Monday'],
        periodsPerDay: 3,
        sections: [section],
        teachers: [busyTeacher, freeTeacher],
        classes: [flexible, constrained],
      });

      expect(periodsOf(result, constrained.id)).toEqual(['Mon 2']);
      expect(periodsOf(result, flexible.id).sort()).toEqual(['Mon 1', 'Mon 3']);
    });

    it("uses a teacher's preferred period when it can", () => {
      const section = newSection();
      const teacher = newTeacher({
        preferred: [{ day: 'Wednesday', period: 4 }],
      });
      const c = newClass([section], teacher);
      const { result } = run({
        sections: [section],
        teachers: [teacher],
        classes: [c],
      });

      expect(periodsOf(result, c.id)).toEqual(['Wed 4']);
    });
  });

  describe('students', () => {
    it('spreads the sessions of a class over different days', () => {
      const section = newSection();
      const teacher = newTeacher();
      const c = newClass([section], teacher, { perWeek: 4 });
      const { result } = run({
        sections: [section],
        teachers: [teacher],
        classes: [c],
      });

      expect(new Set(result.placements.map((p) => p.day)).size).toBe(4);
    });

    it('counts classes right after a slot toward maxConsecutive, not only classes before it', () => {
      const section = newSection();
      const labTeacher = newTeacher({
        unavailable: [1, 2, 5].map((period) => ({ day: 'Monday', period })),
      });
      const lectureTeacher = newTeacher({
        unavailable: [{ day: 'Monday', period: 1 }],
      });
      // The lab goes first and only fits in periods 3-4. The lecture can't take period 1,
      // and periods 2 and 5 would each join the lab in a run of 3 classes.
      const lab = newClass([section], labTeacher, { length: 2, priority: 10 });
      const lecture = newClass([section], lectureTeacher, { priority: 1 });
      const { result } = run({
        days: ['Monday'],
        periodsPerDay: 5,
        maxConsecutive: 2,
        sections: [section],
        teachers: [labTeacher, lectureTeacher],
        classes: [lecture, lab],
      });

      expect(periodsOf(result, lab.id)).toEqual(['Mon 3', 'Mon 4']);
      expect(periodsOf(result, lecture.id)).toEqual([]);
      expect(result.problems.map((p) => p.type)).toEqual([
        'no_rooms',
        'insufficient_slots',
      ]);
    });

    it('lets classes resume right after lunch instead of counting lunch as a class', () => {
      const section = newSection();
      const teacher = newTeacher();
      const c = newClass([section], teacher, { perWeek: 4 });
      const { result } = run({
        days: ['Monday'],
        periodsPerDay: 5,
        maxConsecutive: 2,
        breakPeriods: [3],
        sections: [section],
        teachers: [teacher],
        classes: [c],
      });

      expect(periodsOf(result, c.id).sort()).toEqual([
        'Mon 1',
        'Mon 2',
        'Mon 4',
        'Mon 5',
      ]);
    });

    it('allows a session longer than maxConsecutive, but nothing directly next to it', () => {
      const section = newSection();
      const [t1, t2] = [newTeacher(), newTeacher()];
      const lab = newClass([section], t1, { length: 3, priority: 10 });
      const lecture = newClass([section], t2, { perWeek: 3 });
      const out = run({
        days: ['Monday'],
        periodsPerDay: 7,
        maxConsecutive: 2,
        sections: [section],
        teachers: [t1, t2],
        classes: [lab, lecture],
      });

      expect(periodsOf(out.result, lab.id)).toEqual([
        'Mon 1',
        'Mon 2',
        'Mon 3',
      ]);
      expect(periodsOf(out.result, lecture.id)).toEqual(['Mon 5', 'Mon 6']); // 4 would touch the lab, 7 would make 3 in a row
      expect(violations(out)).toEqual([]);
    });
  });

  it('breaks no hard rule on a busy, randomly generated university', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const random = seeded(seed * 97);
      const pick = <T>(items: T[]) =>
        items[Math.floor(random() * items.length)];
      const sections = Array.from({ length: 30 }, (_, i) =>
        newSection(i % 2 ? ['B1', 'B2'] : [], 50 + (i % 3) * 10),
      );
      const teachers = Array.from({ length: 40 }, () =>
        newTeacher({
          maxPerDay: 5,
          maxPerWeek: 18,
          unavailable: WEEK.flatMap((day) =>
            [1, 2, 3, 5, 6, 7, 8]
              .filter(() => random() < 0.08)
              .map((period) => ({ day, period })),
          ),
          preferred: [
            { day: pick(WEEK), period: 1 + Math.floor(random() * 8) },
          ],
        }),
      );
      const rooms = [
        ...Array.from({ length: 25 }, () =>
          newRoom('lecture', pick([60, 70, 130])),
        ),
        ...Array.from({ length: 10 }, () => newRoom('lab', 35)),
      ];
      const classes: ClassRequest[] = [];
      sections.forEach((s, i) => {
        for (let k = 0; k < 4; k++)
          classes.push(newClass([s], pick(teachers), { perWeek: 3 + (k % 2) }));
        if (s.batches.length) {
          const group = `LAB-${s.id}`;
          classes.push(
            newClass([s], pick(teachers), {
              batch: 'B1',
              needsLab: true,
              length: 2,
              parallelGroup: group,
            }),
          );
          classes.push(
            newClass([s], pick(teachers), {
              batch: 'B2',
              needsLab: true,
              length: 2,
              parallelGroup: group,
            }),
          );
        }
        if (i % 3 === 0 && sections[i + 1])
          classes.push(
            newClass([s, sections[i + 1]], pick(teachers), { perWeek: 2 }),
          );
      });
      const busy = teachers
        .slice(0, 5)
        .map((t) => ({ day: pick(WEEK), period: 4, teacherId: t.id }));

      const out = run(
        {
          periodsPerDay: 8,
          breakPeriods: [5],
          maxConsecutive: 3,
          sections,
          teachers,
          rooms,
          classes,
          busy,
        },
        seed,
      );

      expect(violations(out)).toEqual([]);
      // Teachers are picked at random, so some are overloaded and not everything fits
      const demand = classes.reduce((n, c) => n + c.perWeek * c.length, 0);
      expect(out.result.placements.length).toBeGreaterThan(0.85 * demand);
    }
  });

  it('(the rule checker above does catch broken timetables)', () => {
    const [a, b] = [newSection(), newSection(['B1', 'B2'])];
    const teacher = newTeacher({ maxPerDay: 1 });
    const room = newRoom();
    const c1 = newClass([a], teacher);
    const c2 = newClass([b], teacher);
    const input: SchedulerInput = {
      days: WEEK,
      periodsPerDay: 6,
      breakPeriods: [3],
      maxConsecutive: 3,
      sections: [a, b],
      teachers: [teacher],
      rooms: [room],
      classes: [c1, c2],
      busy: [],
    };
    const bad = (placements: SchedulerResult['placements']) =>
      violations({ input, result: { placements, problems: [] } });

    expect(
      bad([
        { classId: c1.id, day: 'Monday', period: 1, roomId: room.id },
        { classId: c2.id, day: 'Monday', period: 1 },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/double-booked/),
        expect.stringMatching(/over daily limit/),
      ]),
    );
    expect(bad([{ classId: c1.id, day: 'Monday', period: 3 }])).toEqual([
      expect.stringMatching(/during a break/),
    ]);
  });

  it('gives the same timetable for the same random seed', () => {
    const sections = [newSection(), newSection()];
    const teachers = [newTeacher(), newTeacher()];
    const classes = sections.flatMap((s) =>
      teachers.map((t) => newClass([s], t, { perWeek: 3 })),
    );
    const first = run({ sections, teachers, classes }, 42).result;
    const second = run({ sections, teachers, classes }, 42).result;

    expect(second).toEqual(first);
  });
});
