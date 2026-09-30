const mongoose = require('mongoose');

// Images are stored in MongoDB (not on disk) because Render's filesystem is ephemeral.
// They are only ever served through an authenticated, owner-checked endpoint.
const screenshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', required: true, index: true },
    kind: { type: String, enum: ['before', 'entry', 'exit'], required: true },
    contentType: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Screenshot', screenshotSchema);
