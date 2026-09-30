const express = require('express');
const mongoose = require('mongoose');
const Screenshot = require('../models/Screenshot');
const { asyncHandler, HttpError } = require('../middleware/errors');

const router = express.Router();

/** Streams a screenshot image. Only the owner can read it. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Screenshot not found');
    const shot = await Screenshot.findOne({ _id: req.params.id, userId: req.userId });
    if (!shot) throw new HttpError(404, 'Screenshot not found');
    res.set({
      'Content-Type': shot.contentType,
      'Content-Length': shot.size,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    res.send(shot.data);
  })
);

module.exports = router;
