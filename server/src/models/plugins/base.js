import mongoose from 'mongoose';

/**
 * Base plugin applied to every tenant-scoped collection.
 * - workspaceId on every document (multi-tenant isolation)
 * - createdBy audit pointer
 * - timestamps
 * - optional soft delete (deletedAt) with a query helper
 * - optimistic concurrency (versionKey checked on save)
 */
export function basePlugin(schema, { softDelete = false, tenant = true } = {}) {
  if (tenant) {
    schema.add({
      workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    });
  }
  schema.add({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  });
  if (softDelete) {
    schema.add({ deletedAt: { type: Date, default: null, index: true } });
    schema.statics.findLive = function (filter = {}) {
      return this.find({ ...filter, deletedAt: null });
    };
  }
  schema.set('timestamps', true);
  schema.set('optimisticConcurrency', true);
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  });
}
