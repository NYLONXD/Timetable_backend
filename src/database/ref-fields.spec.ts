import { Schema } from 'mongoose';
import { AssignmentSchema } from '../assignments/schemas/assignment.schema';
import { RoomSchema } from '../rooms/schemas/room.schema';
import { SectionSchema } from '../sections/schemas/section.schema';
import { TeacherAvailabilitySchema } from '../teacher-availability/schemas/teacher-availability.schema';
import { TeacherSchema } from '../teachers/schemas/teacher.schema';
import { ConflictSchema } from '../timetable/schemas/conflicts.schema';
import { GenerationSchema } from '../timetable/schemas/generation.schema';
import { TimetableSlotSchema } from '../timetable/schemas/timetable-slots.schema';

// With `type: Types.ObjectId`, @nestjs/mongoose creates an untyped Mixed field instead: it stores
// any value as-is and skips casting in queries. Ref fields need `MongooseSchema.Types.ObjectId`.
const refFields: [string, Schema, string[]][] = [
  ['Assignment', AssignmentSchema, ['subjectId', 'teacherId', 'roomId']],
  ['TeacherAvailability', TeacherAvailabilitySchema, ['teacherId']],
  [
    'TimetableSlot',
    TimetableSlotSchema,
    ['generationId', 'subjectId', 'teacherId', 'roomId', 'originalTeacherId'],
  ],
  ['Conflict', ConflictSchema, ['generationId']],
  ['Generation', GenerationSchema, ['termId']],
  ['Section', SectionSchema, ['departmentId']],
  ['Teacher', TeacherSchema, ['departmentId']],
  ['Room', RoomSchema, ['departmentId']],
];

const refArrays: [string, Schema, string][] = [
  ['Assignment', AssignmentSchema, 'sectionIds'],
  ['TimetableSlot', TimetableSlotSchema, 'sectionIds'],
  ['Generation', GenerationSchema, 'sectionIds'],
  ['Conflict', ConflictSchema, 'affectedSlots'],
];

describe('schema ref fields', () => {
  it.each(refFields)('%s refs are ObjectIds', (_model, schema, paths) => {
    for (const path of paths) {
      expect(schema.path(path).instance).toBe('ObjectId');
    }
  });

  it.each(refArrays)('%s.%s holds ObjectIds', (_model, schema, path) => {
    expect(schema.path(path).getEmbeddedSchemaType()?.instance).toBe(
      'ObjectId',
    );
  });
});
