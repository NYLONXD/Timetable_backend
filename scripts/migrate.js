// Brings an existing database up to date with the current schemas. Run it after pulling new
// code and before starting the app. Each step checks what still needs doing, so it is safe to
// run more than once. Only reports what it would change unless run with --apply.
//
//   npm run migrate                # dry run
//   npm run migrate -- --apply     # write the changes, then restart the app
//
// Steps:
//   1. Ref fields stored as strings (written while they were untyped "Mixed" fields) become
//      ObjectIds. Timetable slots from that time hold a text dump of a whole document; the id
//      is taken out of it.
//   2. Indexes on the old `sectionId` and `department` fields are dropped. This must happen
//      before step 3: once `sectionId` is gone, the old unique indexes would see every
//      document as a duplicate. The app creates the new indexes when it next starts.
//   3. Assignments and slots: `sectionId` becomes `sectionIds` (combined classes).
//   4. Teachers: the free-text `department` becomes a link to a Department, which is created
//      if needed. Sections whose branch matches a department's code or name are linked to it.
//   5. Timetables made before terms existed are put in a term called "Imported timetables",
//      and record which sections they cover.
//   6. Slots and conflicts left behind by deleted timetables are removed.

const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/timetable';
const { ObjectId } = mongoose.Types;
const IMPORTED_TERM = 'Imported timetables';

const log = (message) => console.log(`  ${message}`);

// 1. Takes a plain id string, or a dump like "{ _id: new ObjectId('...'), name: 'Alice', ... }"
function toObjectId(value) {
  const match =
    /^([0-9a-f]{24})$/i.exec(value) ||
    /ObjectId\(['"]([0-9a-f]{24})['"]\)/i.exec(value);
  return match ? new ObjectId(match[1]) : null;
}

async function stringRefsToObjectIds(db) {
  const refFields = {
    assignments: ['sectionId', 'subjectId', 'teacherId'],
    teacheravailabilities: ['teacherId'],
    timetableslots: ['generationId', 'sectionId', 'subjectId', 'teacherId', 'originalTeacherId'],
    conflicts: ['generationId'],
  };
  for (const [collection, fields] of Object.entries(refFields)) {
    const updates = [];
    let unreadable = 0;
    const cursor = db.collection(collection).find({
      $or: fields.map((field) => ({ [field]: { $type: 'string' } })),
    });
    for await (const doc of cursor) {
      const $set = {};
      for (const field of fields) {
        if (typeof doc[field] !== 'string') continue;
        const id = toObjectId(doc[field]);
        if (id) $set[field] = id;
        else unreadable++;
      }
      if (Object.keys($set).length > 0) {
        updates.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } });
      }
    }
    const note = unreadable ? `, ${unreadable} values with no id in them (left as-is)` : '';
    log(`${collection}: ${updates.length} documents with string ids${note}`);
    if (apply && updates.length > 0) {
      await db.collection(collection).bulkWrite(updates, { ordered: false });
    }
  }
}

// 2.
async function dropStaleIndexes(db) {
  const stale = { assignments: 'sectionId', timetableslots: 'sectionId', teachers: 'department' };
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const [collection, field] of Object.entries(stale)) {
    if (!existing.has(collection)) continue;
    const indexes = await db.collection(collection).indexes();
    for (const index of indexes.filter((i) => field in i.key)) {
      log(`${collection}: index ${index.name} on the old ${field} field to drop`);
      if (apply) await db.collection(collection).dropIndex(index.name);
    }
  }
}

// 3.
async function sectionIdToSectionIds(db) {
  for (const collection of ['assignments', 'timetableslots']) {
    const filter = { sectionId: { $exists: true }, sectionIds: { $exists: false } };
    const count = await db.collection(collection).countDocuments(filter);
    log(`${collection}: ${count} documents to move from sectionId to sectionIds`);
    if (apply && count > 0) {
      await db
        .collection(collection)
        .updateMany(filter, [{ $set: { sectionIds: ['$sectionId'] } }, { $unset: 'sectionId' }]);
    }
  }
}

// 4.
function departmentCode(name, taken) {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const minor = new Set(['and', 'of', 'the', 'for', 'in']);
  let code =
    words.length === 1
      ? words[0].slice(0, 10).toUpperCase()
      : words
          .filter((w) => !minor.has(w.toLowerCase()))
          .map((w) => w[0])
          .join('')
          .toUpperCase();
  if (!code) code = 'DEPT';
  let candidate = code;
  for (let n = 2; taken.has(candidate); n++) candidate = `${code}-${n}`;
  taken.add(candidate);
  return candidate;
}

async function departmentTextToLinks(db) {
  const teachers = db.collection('teachers');
  const departments = db.collection('departments');
  const names = (
    await teachers.distinct('department', {
      department: { $type: 'string', $ne: '' },
      departmentId: { $exists: false },
    })
  )
    .map((n) => n.trim())
    .filter(Boolean);
  const existing = await departments.find().toArray();
  const taken = new Set(existing.map((d) => d.code));
  const byKey = new Map(existing.flatMap((d) => [[d.code.toLowerCase(), d], [d.name.toLowerCase(), d]]));

  let created = 0;
  let linked = 0;
  for (const name of [...new Set(names)]) {
    let department = byKey.get(name.toLowerCase());
    if (!department) {
      department = { _id: new ObjectId(), code: departmentCode(name, taken), name, createdAt: new Date(), updatedAt: new Date() };
      byKey.set(name.toLowerCase(), department);
      byKey.set(department.code.toLowerCase(), department);
      created++;
      if (apply) await departments.insertOne(department);
    }
    const filter = {
      department: { $regex: `^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$` },
      departmentId: { $exists: false },
    };
    linked += await teachers.countDocuments(filter);
    if (apply) await teachers.updateMany(filter, { $set: { departmentId: department._id } });
  }
  log(`departments: ${created} to create from teachers' department names`);
  log(`teachers: ${linked} to link to a department`);

  const leftover = await teachers.countDocuments({ department: { $exists: true } });
  log(`teachers: ${leftover} with the old department text field to remove`);
  if (apply && leftover > 0) {
    // Only unset text that has been turned into a link (or was empty)
    await teachers.updateMany(
      { department: { $exists: true }, $or: [{ departmentId: { $exists: true } }, { department: { $in: ['', null] } }] },
      { $unset: { department: '' } },
    );
  }

  // Sections whose branch names a department
  let sectionsLinked = 0;
  const sections = db.collection('sections');
  for await (const section of sections.find({ departmentId: { $exists: false }, branch: { $type: 'string' } })) {
    const department = byKey.get(section.branch.trim().toLowerCase());
    if (!department) continue;
    sectionsLinked++;
    if (apply) await sections.updateOne({ _id: section._id }, { $set: { departmentId: department._id } });
  }
  log(`sections: ${sectionsLinked} to link to the department their branch names`);
}

// 5.
async function timetablesIntoTerm(db) {
  const generations = db.collection('generations');
  const orphans = await generations.find({ termId: { $exists: false } }).sort({ createdAt: -1 }).toArray();
  log(`timetables: ${orphans.length} to put in the "${IMPORTED_TERM}" term`);
  if (orphans.length === 0) return;

  let term = await db.collection('terms').findOne({ name: IMPORTED_TERM });
  if (!term) {
    // Take the bell schedule of the most recent timetable. Each timetable keeps its own copy.
    const { config } = orphans[0];
    term = {
      _id: new ObjectId(),
      name: IMPORTED_TERM,
      days: config.days,
      periodsPerDay: config.periodsPerDay,
      periodTimes: [],
      breakPeriods: config.breakPeriods ?? [],
      ...(config.lunchPeriod ? { lunchPeriod: config.lunchPeriod } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    log(`terms: 1 to create ("${IMPORTED_TERM}")`);
    if (apply) await db.collection('terms').insertOne(term);
  }

  for (const generation of orphans) {
    const slots = db.collection('timetableslots');
    const sectionIds = [
      ...(await slots.distinct('sectionIds', { generationId: generation._id })),
      ...(await slots.distinct('sectionId', { generationId: generation._id })),
    ].filter((id) => id instanceof ObjectId);
    if (apply) {
      await generations.updateOne(
        { _id: generation._id },
        { $set: { termId: term._id, sectionIds, 'config.periodTimes': [] } },
      );
    }
  }
}

// 6.
async function removeOrphans(db) {
  const generationIds = await db.collection('generations').distinct('_id');
  for (const collection of ['timetableslots', 'conflicts']) {
    const orphans = { generationId: { $nin: generationIds } };
    const count = await db.collection(collection).countDocuments(orphans);
    log(`${collection}: ${count} left behind by deleted timetables`);
    if (apply && count > 0) {
      await db.collection(collection).deleteMany(orphans);
    }
  }
}

async function main() {
  await mongoose.connect(uri);
  const { db } = mongoose.connection;
  console.log(`${apply ? 'Applying changes to' : 'Dry run on'} database "${db.databaseName}"`);

  const steps = [
    ['1. String ids to ObjectIds', stringRefsToObjectIds],
    ['2. Indexes on old fields', dropStaleIndexes],
    ['3. sectionId to sectionIds', sectionIdToSectionIds],
    ['4. Teacher department text to departments', departmentTextToLinks],
    ['5. Timetables into a term', timetablesIntoTerm],
    ['6. Leftovers of deleted timetables', removeOrphans],
  ];
  for (const [title, step] of steps) {
    console.log(`\n${title}`);
    await step(db);
  }

  console.log(
    apply
      ? '\nDone. Restart the app so it creates the new indexes.'
      : '\nNothing was changed. Run again with --apply to write these changes.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
