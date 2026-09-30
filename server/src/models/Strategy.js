const mongoose = require('mongoose');

const conditionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: true }
);

const strategySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    entryRules: { type: String, trim: true, maxlength: 5000, default: '' },
    exitRules: { type: String, trim: true, maxlength: 5000, default: '' },
    riskRules: { type: String, trim: true, maxlength: 5000, default: '' },
    conditions: { type: [conditionSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 5000, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

strategySchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Strategy', strategySchema);
