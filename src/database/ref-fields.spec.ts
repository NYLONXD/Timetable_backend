import { Schema } from 'mongoose';
import { AssignmentSchema } from '../assignments/schemas/assignment.schema';
import { TeacherAvailabilitySchema } from '../teacher-availability/schemas/teacher-availability.schema';
import { ConflictSchema } from '../timetable/schemas/conflicts.schema';
import { TimetableSlotSchema } from '../timetable/schemas/timetable-slots.schema';

// With `type: Types.ObjectId`, @nestjs/mongoose creates an untyped Mixed field instead: it stores
// any value as-is and skips casting in queries. Ref fields need `MongooseSchema.Types.ObjectId`.
const refFields: [string, Schema, string[]][] = [
  ['Assignment', AssignmentSchema, ['sectionId', 'subjectId', 'teacherId']],
  ['TeacherAvailability', TeacherAvailabilitySchema, ['teacherId']],
  [
    'TimetableSlot',
    TimetableSlotSchema,
    [
      'generationId',
      'sectionId',
      'subjectId',
      'teacherId',
      'originalTeacherId',
    ],
  ],
  ['Conflict', ConflictSchema, ['generationId']],
];

describe('schema ref fields', () => {
  it.each(refFields)('%s refs are ObjectIds', (_model, schema, paths) => {
    for (const path of paths) {
      expect(schema.path(path).instance).toBe('ObjectId');
    }
  });

  it('Conflict.affectedSlots holds ObjectIds', () => {
    const affectedSlots = ConflictSchema.path('affectedSlots');
    expect(affectedSlots.getEmbeddedSchemaType()?.instance).toBe('ObjectId');
  });
});
