// Fills the database with dummy data for a small university: 5 departments, 6 sections,
// 19 teachers, 18 rooms, 2 terms and the 2026-27 odd semester's assignments. The data uses
// everything the generator supports: lab batches running side by side, combined classes,
// elective baskets (one of them across departments), pinned rooms, soft constraints, and
// teacher unavailability and preferences. Only reports what it would do unless run with --apply.
//
//   npm run seed                      # dry run
//   npm run seed -- --apply           # add the data; the collections must be empty
//   npm run seed -- --apply --reset   # DELETE all existing data first, timetables included
//
// Then start the app and generate a timetable for "2026-27 Odd Semester" with all assignments
// selected. The data writes straight to the collections, so run the app once afterwards on a
// fresh database to create the indexes.

const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const reset = process.argv.includes('--reset');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/timetable';
const { ObjectId } = mongoose.Types;

// Collections that point at the seeded data. --reset empties these too.
const DEPENDENT = ['generations', 'timetableslots', 'conflicts'];

const log = (message) => console.log(`  ${message}`);

function buildSeed() {
  const now = new Date();
  const doc = (fields) => ({ _id: new ObjectId(), ...fields, createdAt: now, updatedAt: now });
  const index = (docs, key) => Object.fromEntries(docs.map((d) => [d[key], d]));

  const departments = [
    ['CSE', 'Computer Science and Engineering'],
    ['ECE', 'Electronics and Communication Engineering'],
    ['ME', 'Mechanical Engineering'],
    ['MA', 'Mathematics'],
    ['HSS', 'Humanities and Social Sciences'],
  ].map(([code, name]) => doc({ code, name }));
  const department = index(departments, 'code');

  // Labs are named generically where batches of one class use two of them at once
  const rooms = [
    ['LH-101', 'Lecture Hall 101', 'Academic Block A', 'lecture', 72],
    ['LH-102', 'Lecture Hall 102', 'Academic Block A', 'lecture', 72],
    ['LH-103', 'Lecture Hall 103', 'Academic Block A', 'lecture', 72],
    ['LH-104', 'Lecture Hall 104', 'Academic Block A', 'lecture', 72],
    ['LH-105', 'Lecture Hall 105', 'Academic Block A', 'lecture', 72],
    ['LT-1', 'Lecture Theatre 1', 'Academic Block A', 'lecture', 130],
    ['LT-2', 'Lecture Theatre 2', 'Academic Block A', 'lecture', 150],
    ['SR-301', 'Seminar Room 301', 'Academic Block B', 'seminar', 40],
    ['SR-302', 'Seminar Room 302', 'Academic Block B', 'seminar', 40],
    ['SH-1', 'CSE Seminar Hall', 'CSE Block', 'seminar', 80, 'CSE'],
    ['CS-LAB-1', 'Data Structures Lab', 'CSE Block', 'lab', 36, 'CSE'],
    ['CS-LAB-2', 'Programming Lab', 'CSE Block', 'lab', 36, 'CSE'],
    ['CS-LAB-3', 'Systems Lab', 'CSE Block', 'lab', 36, 'CSE'],
    ['CS-LAB-4', 'Database Lab', 'CSE Block', 'lab', 36, 'CSE'],
    ['EC-LAB-1', 'Electronics Lab 1', 'ECE Block', 'lab', 32, 'ECE'],
    ['EC-LAB-2', 'Electronics Lab 2', 'ECE Block', 'lab', 32, 'ECE'],
    ['ME-LAB-1', 'Mechanical Lab 1', 'Mechanical Workshop', 'lab', 30, 'ME'],
    ['ME-LAB-2', 'Mechanical Lab 2', 'Mechanical Workshop', 'lab', 30, 'ME'],
  ].map(([code, name, building, type, capacity, dept]) =>
    doc({
      code,
      name,
      building,
      type,
      capacity,
      ...(dept ? { departmentId: department[dept]._id } : {}),
    }),
  );
  const room = index(rooms, 'code');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const bellSchedule = {
    days,
    periodsPerDay: 8,
    // Short break 10:40-10:50 falls between periods; period 5 is lunch
    periodTimes: [
      ['09:00', '09:50'],
      ['09:50', '10:40'],
      ['10:50', '11:40'],
      ['11:40', '12:30'],
      ['12:30', '13:20'],
      ['13:20', '14:10'],
      ['14:10', '15:00'],
      ['15:00', '15:50'],
    ].map(([start, end]) => ({ start, end })),
    breakPeriods: [],
    lunchPeriod: 5,
  };
  const terms = [
    doc({
      name: '2026-27 Odd Semester',
      startDate: new Date('2026-07-20'),
      endDate: new Date('2026-12-04'),
      ...bellSchedule,
    }),
    doc({
      name: '2026-27 Even Semester',
      startDate: new Date('2027-01-11'),
      endDate: new Date('2027-05-14'),
      ...bellSchedule,
    }),
  ];

  const sections = [
    ['CSE-3A', 'B.Tech CSE, Semester 3, Section A', 3, 'CSE', 60],
    ['CSE-3B', 'B.Tech CSE, Semester 3, Section B', 3, 'CSE', 60],
    ['CSE-5A', 'B.Tech CSE, Semester 5, Section A', 5, 'CSE', 56],
    ['ECE-3A', 'B.Tech ECE, Semester 3, Section A', 3, 'ECE', 60],
    ['ECE-5A', 'B.Tech ECE, Semester 5, Section A', 5, 'ECE', 48],
    ['ME-3A', 'B.Tech ME, Semester 3, Section A', 3, 'ME', 56],
  ].map(([code, name, semester, branch, strength]) =>
    doc({
      code,
      name,
      semester,
      branch,
      strength,
      departmentId: department[branch]._id,
      batches: ['B1', 'B2'],
    }),
  );
  const section = index(sections, 'code');

  // [code, name, category, classes per week, periods per class]
  const subjects = [
    ['CS201', 'Data Structures', 'theory', 3, 1],
    ['CS201L', 'Data Structures Lab', 'lab', 1, 2],
    ['CS203', 'Object Oriented Programming', 'theory', 3, 1],
    ['CS203L', 'Object Oriented Programming Lab', 'lab', 1, 2],
    ['CS205', 'Computer Organization and Architecture', 'theory', 3, 1],
    ['CS301', 'Operating Systems', 'theory', 3, 1],
    ['CS301L', 'Operating Systems Lab', 'lab', 1, 2],
    ['CS302', 'Database Management Systems', 'theory', 3, 1],
    ['CS302L', 'Database Management Systems Lab', 'lab', 1, 2],
    ['CS303', 'Computer Networks', 'theory', 3, 1],
    ['CS351', 'Machine Learning', 'theory', 3, 1],
    ['CS352', 'Cloud Computing', 'theory', 3, 1],
    ['CS399', 'Technical Seminar', 'seminar', 1, 2],
    ['EC201', 'Signals and Systems', 'theory', 3, 1],
    ['EC201T', 'Signals and Systems Tutorial', 'tutorial', 1, 1],
    ['EC202', 'Analog Electronic Circuits', 'theory', 3, 1],
    ['EC202L', 'Analog Electronic Circuits Lab', 'lab', 1, 2],
    ['EC203', 'Network Theory', 'theory', 3, 1],
    ['EC211', 'Digital Logic Design', 'theory', 3, 1],
    ['EC301', 'Digital Signal Processing', 'theory', 3, 1],
    ['EC302', 'Microprocessors and Microcontrollers', 'theory', 3, 1],
    ['EC302L', 'Microprocessors Lab', 'lab', 1, 2],
    ['EC303', 'VLSI Design', 'theory', 3, 1],
    ['EC304', 'Control Systems', 'theory', 3, 1],
    ['EC351', 'Internet of Things', 'theory', 3, 1],
    ['ME201', 'Engineering Thermodynamics', 'theory', 3, 1],
    ['ME202', 'Strength of Materials', 'theory', 3, 1],
    ['ME202L', 'Strength of Materials Lab', 'lab', 1, 3],
    ['ME203', 'Manufacturing Processes', 'theory', 3, 1],
    ['MA201', 'Discrete Mathematics', 'theory', 4, 1],
    ['MA202', 'Probability and Statistics', 'theory', 4, 1],
    ['MA203', 'Numerical Methods', 'theory', 3, 1],
    ['MA301', 'Operations Research', 'theory', 3, 1],
    ['HS201', 'Professional Communication', 'theory', 2, 1],
    ['HS301', 'Engineering Economics', 'theory', 3, 1],
  ].map(([code, name, category, defaultCredits, defaultSessionLength]) =>
    doc({
      code,
      name,
      category,
      defaultCredits,
      requiresConsecutive: defaultSessionLength > 1,
      defaultSessionLength,
    }),
  );
  const subject = index(subjects, 'code');

  // [key used below, staffId, name, department, max periods per day, per week]
  const teacherRows = [
    ['rao', 'EMP-1001', 'Dr. Ananya Rao', 'CSE', 4, 12], // head of department
    ['menon', 'EMP-1002', 'Dr. Vikram Menon', 'CSE', 5, 18],
    ['kulkarni', 'EMP-1003', 'Prof. Sneha Kulkarni', 'CSE', 5, 18],
    ['nair', 'EMP-1004', 'Mr. Arjun Nair', 'CSE', 5, 20],
    ['sharma', 'EMP-1005', 'Dr. Priya Sharma', 'CSE', 5, 18],
    ['verma', 'EMP-1006', 'Dr. Rahul Verma', 'CSE', 5, 18],
    ['iyer', 'EMP-1007', 'Ms. Kavya Iyer', 'CSE', 5, 18],
    ['das', 'EMP-1008', 'Mr. Rohan Das', 'CSE', 6, 24], // new joiner, no classes yet
    ['pillai', 'EMP-2001', 'Dr. Suresh Pillai', 'ECE', 4, 12], // head of department
    ['joshi', 'EMP-2002', 'Dr. Meera Joshi', 'ECE', 5, 18],
    ['reddy', 'EMP-2003', 'Mr. Karthik Reddy', 'ECE', 5, 18],
    ['hegde', 'EMP-2004', 'Ms. Divya Hegde', 'ECE', 5, 18],
    ['gupta', 'EMP-3001', 'Dr. Rajesh Gupta', 'ME', 4, 12], // head of department
    ['sheikh', 'EMP-3002', 'Dr. Fatima Sheikh', 'ME', 5, 18],
    ['singh', 'EMP-3003', 'Mr. Harpreet Singh', 'ME', 5, 18],
    ['narayanan', 'EMP-4001', 'Dr. Lakshmi Narayanan', 'MA', 5, 18],
    ['kapoor', 'EMP-4002', 'Dr. Anil Kapoor', 'MA', 5, 18],
    ['khan', 'EMP-5001', 'Dr. Sameer Khan', 'HSS', 5, 16],
    ['bhatt', 'EMP-5002', 'Prof. Neha Bhatt', 'HSS', 4, 8], // visiting faculty
  ];
  const teacher = {};
  for (const [key, staffId, name, dept, maxHoursPerDay, maxHoursPerWeek] of teacherRows) {
    const email = `${name.split(' ').slice(1).join('.').toLowerCase()}@example.edu`;
    teacher[key] = doc({
      staffId,
      name,
      email,
      departmentId: department[dept]._id,
      maxHoursPerDay,
      maxHoursPerWeek,
    });
  }
  const teachers = Object.values(teacher);

  const teacherAvailabilities = [];
  const mark = (key, type, reason, dayList, periods) => {
    for (const day of dayList) {
      for (const period of periods) {
        teacherAvailabilities.push(
          doc({ teacherId: teacher[key]._id, day, period, type, reason }),
        );
      }
    }
  };
  const allPeriods = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const hod of ['rao', 'pillai', 'gupta']) {
    mark(hod, 'unavailable', 'Heads of department meeting', ['Wednesday'], [7, 8]);
  }
  mark('bhatt', 'unavailable', 'Visiting faculty, on campus Thursday and Friday only', ['Monday', 'Tuesday', 'Wednesday'], allPeriods);
  mark('joshi', 'unavailable', 'Research day', ['Friday'], [6, 7, 8]);
  mark('iyer', 'unavailable', 'Faculty development programme', ['Monday'], [1, 2]);
  mark('narayanan', 'preferred', 'Prefers morning classes', days, [1, 2, 3]);

  // Sessions default to the subject's classes per week and periods per class
  const assignments = [];
  const assign = (sectionCodes, subjectCode, teacherKey, options = {}) => {
    const { perWeek, length, room: roomCode, ...rest } = options;
    const s = subject[subjectCode];
    assignments.push(
      doc({
        sectionIds: sectionCodes.map((code) => section[code]._id),
        subjectId: s._id,
        teacherId: teacher[teacherKey]._id,
        sessions: {
          perWeek: perWeek ?? s.defaultCredits,
          length: length ?? s.defaultSessionLength,
        },
        constraint: 'hard',
        priority: 5,
        ...(roomCode ? { roomId: room[roomCode]._id } : {}),
        ...rest,
      }),
    );
  };
  // Two labs of one section in rotation: while B1 does lab A, B2 does lab B, and the other
  // way round in a second slot. Each lab stays in its own room.
  const labRotation = (sectionCode, [subjectA, teacherA, roomA], [subjectB, teacherB, roomB]) => {
    const group = sectionCode.replace('-', '');
    const lab = { priority: 7 };
    assign([sectionCode], subjectA, teacherA, { ...lab, batch: 'B1', room: roomA, parallelGroup: `${group}-LAB-1` });
    assign([sectionCode], subjectB, teacherB, { ...lab, batch: 'B2', room: roomB, parallelGroup: `${group}-LAB-1` });
    assign([sectionCode], subjectB, teacherB, { ...lab, batch: 'B1', room: roomB, parallelGroup: `${group}-LAB-2` });
    assign([sectionCode], subjectA, teacherA, { ...lab, batch: 'B2', room: roomA, parallelGroup: `${group}-LAB-2` });
  };
  // Both batches do the same lab at once, in two rooms with two teachers
  const labSplit = (sectionCode, subjectCode, [teacherB1, roomB1], [teacherB2, roomB2]) => {
    const group = `${sectionCode.replace('-', '')}-LAB`;
    assign([sectionCode], subjectCode, teacherB1, { priority: 7, batch: 'B1', room: roomB1, parallelGroup: group });
    assign([sectionCode], subjectCode, teacherB2, { priority: 7, batch: 'B2', room: roomB2, parallelGroup: group });
  };
  const communication = { constraint: 'soft', priority: 3 };

  // CSE, semester 3. Digital Logic Design is taught by ECE faculty.
  for (const [code, dsTeacher] of [['CSE-3A', 'rao'], ['CSE-3B', 'menon']]) {
    assign([code], 'CS201', dsTeacher);
    assign([code], 'CS203', 'kulkarni');
    assign([code], 'CS205', 'iyer');
    assign([code], 'MA201', 'narayanan');
    assign([code], 'EC211', 'joshi');
    labRotation(code, ['CS201L', 'menon', 'CS-LAB-1'], ['CS203L', 'nair', 'CS-LAB-2']);
  }
  assign(['CSE-3A', 'CSE-3B'], 'HS201', 'khan', communication); // combined class

  // CSE, semester 5, with a program elective basket
  assign(['CSE-5A'], 'CS301', 'rao');
  assign(['CSE-5A'], 'CS302', 'sharma');
  assign(['CSE-5A'], 'CS303', 'verma');
  labRotation('CSE-5A', ['CS301L', 'verma', 'CS-LAB-3'], ['CS302L', 'sharma', 'CS-LAB-4']);
  assign(['CSE-5A'], 'CS399', 'sharma', { room: 'SH-1', constraint: 'soft', priority: 4 });
  assign(['CSE-5A'], 'CS351', 'kulkarni', { parallelGroup: 'CSE5-ELECTIVE', studentCount: 32, priority: 6 });
  assign(['CSE-5A'], 'CS352', 'verma', { parallelGroup: 'CSE5-ELECTIVE', studentCount: 24, priority: 6 });

  // Open elective basket shared by semester 5 of CSE and ECE
  const openElective = { parallelGroup: 'SEM5-OPEN-ELECTIVE', priority: 6 };
  assign(['CSE-5A', 'ECE-5A'], 'HS301', 'bhatt', { ...openElective, studentCount: 40 });
  assign(['CSE-5A', 'ECE-5A'], 'MA301', 'kapoor', { ...openElective, studentCount: 35 });
  assign(['CSE-5A', 'ECE-5A'], 'EC351', 'joshi', { ...openElective, studentCount: 29 });

  // ECE, semester 3. Tutorials are per batch, so one batch is free while the other has one.
  assign(['ECE-3A'], 'EC201', 'pillai');
  assign(['ECE-3A'], 'EC201T', 'pillai', { batch: 'B1' });
  assign(['ECE-3A'], 'EC201T', 'pillai', { batch: 'B2' });
  assign(['ECE-3A'], 'EC202', 'reddy');
  assign(['ECE-3A'], 'EC203', 'hegde');
  labSplit('ECE-3A', 'EC202L', ['reddy', 'EC-LAB-1'], ['hegde', 'EC-LAB-2']);

  // Maths and communication for ECE and ME semester 3 together
  assign(['ECE-3A', 'ME-3A'], 'MA202', 'kapoor');
  assign(['ECE-3A', 'ME-3A'], 'HS201', 'khan', communication);

  // ECE, semester 5
  assign(['ECE-5A'], 'EC301', 'pillai');
  assign(['ECE-5A'], 'EC302', 'reddy');
  assign(['ECE-5A'], 'EC303', 'joshi');
  assign(['ECE-5A'], 'EC304', 'hegde');
  labSplit('ECE-5A', 'EC302L', ['reddy', 'EC-LAB-2'], ['hegde', 'EC-LAB-1']);

  // ME, semester 3. The materials lab is a 3-period session.
  assign(['ME-3A'], 'ME201', 'gupta');
  assign(['ME-3A'], 'ME202', 'sheikh');
  assign(['ME-3A'], 'ME203', 'singh');
  assign(['ME-3A'], 'MA203', 'narayanan');
  labSplit('ME-3A', 'ME202L', ['sheikh', 'ME-LAB-1'], ['singh', 'ME-LAB-2']);

  return {
    departments,
    rooms,
    terms,
    sections,
    subjects,
    teachers,
    teacheravailabilities: teacherAvailabilities,
    assignments,
  };
}

async function main() {
  await mongoose.connect(uri);
  const { db } = mongoose.connection;
  console.log(`${apply ? 'Seeding' : 'Dry run on'} database "${db.databaseName}"`);

  const seed = buildSeed();
  const occupied = [];
  for (const collection of [...Object.keys(seed), ...DEPENDENT]) {
    const count = await db.collection(collection).countDocuments();
    if (count > 0) occupied.push([collection, count]);
  }

  if (occupied.length > 0) {
    console.log(`\nAlready in the database${reset ? ' (to delete)' : ''}`);
    for (const [collection, count] of occupied) log(`${collection}: ${count}`);
  }
  console.log('\nTo add');
  for (const [collection, docs] of Object.entries(seed)) log(`${collection}: ${docs.length}`);

  if (occupied.length > 0 && !reset) {
    console.log(
      '\nNothing was changed: the dummy data only goes into an empty database. Run with ' +
        '--apply --reset to delete the data above and replace it.',
    );
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log('\nNothing was changed. Run again with --apply to write these changes.');
    return;
  }

  for (const [collection] of occupied) {
    await db.collection(collection).deleteMany({});
  }
  for (const [collection, docs] of Object.entries(seed)) {
    await db.collection(collection).insertMany(docs);
  }
  console.log('\nDone. Start the app and generate a timetable for "2026-27 Odd Semester".');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { buildSeed };
