// One-off repair for data written while ref fields were untyped (Mongoose "Mixed"):
//   - assignments and teacher availability store ids as plain strings instead of ObjectIds
//   - timetable slots store a text dump of the whole section/subject/teacher instead of its id
//   - deleting a timetable left its slots and conflicts behind
// Only reports what it would change unless run with --apply. Safe to run more than once.
//
//   npm run migrate:object-ids
//   npm run migrate:object-ids -- --apply

const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/timetable';

const refFields = {
  assignments: ['sectionId', 'subjectId', 'teacherId'],
  teacheravailabilities: ['teacherId'],
  timetableslots: [
    'generationId',
    'sectionId',
    'subjectId',
    'teacherId',
    'originalTeacherId',
  ],
  conflicts: ['generationId'],
};

// Takes a plain id string, or a dump like "{ _id: new ObjectId('...'), name: 'Alice', ... }"
function toObjectId(value) {
  const match =
    /^([0-9a-f]{24})$/i.exec(value) ||
    /ObjectId\(['"]([0-9a-f]{24})['"]\)/i.exec(value);
  return match ? new mongoose.Types.ObjectId(match[1]) : null;
}

async function fixRefs(db, collection, fields) {
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
  console.log(`${collection}: ${updates.length} documents with string refs${note}`);
  if (apply && updates.length > 0) {
    await db.collection(collection).bulkWrite(updates, { ordered: false });
  }
  return updates.length;
}

async function removeOrphans(db, collection) {
  const generationIds = await db.collection('generations').distinct('_id');
  const orphans = { generationId: { $nin: generationIds } };
  const count = await db.collection(collection).countDocuments(orphans);
  console.log(`${collection}: ${count} left behind by deleted timetables`);
  if (apply && count > 0) {
    await db.collection(collection).deleteMany(orphans);
  }
}

async function main() {
  await mongoose.connect(uri);
  const { db } = mongoose.connection;
  console.log(`${apply ? 'Applying changes to' : 'Dry run on'} database "${db.databaseName}"\n`);

  let fixedSlots = 0;
  for (const [collection, fields] of Object.entries(refFields)) {
    const fixed = await fixRefs(db, collection, fields);
    if (collection === 'timetableslots') fixedSlots = fixed;
  }
  for (const collection of ['timetableslots', 'conflicts']) {
    await removeOrphans(db, collection);
  }

  if (fixedSlots > 0) {
    console.log(
      '\nTimetables generated before this fix ignored teacher unavailability. Regenerate them.',
    );
  }
  if (!apply) {
    console.log('\nNothing was changed. Run again with --apply to write these changes.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
