const mongoose = require('mongoose');

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
const MARKETS = ['forex', 'crypto', 'gold', 'stocks', 'other'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },

    // Account settings
    accountName: { type: String, trim: true, maxlength: 80, default: 'Main Account' },
    baseCurrency: { type: String, enum: CURRENCIES, default: 'INR' },
    startingBalance: { type: Number, min: 0, default: 0 },

    // Journal settings
    defaultRiskPercentage: { type: Number, min: 0, max: 100, default: 1 },
    timezone: { type: String, trim: true, maxlength: 64, default: 'Asia/Kolkata' },
    defaultMarket: { type: String, enum: MARKETS, default: 'crypto' },
    defaultTimeframe: { type: String, trim: true, maxlength: 20, default: '' },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    accountName: this.accountName,
    baseCurrency: this.baseCurrency,
    startingBalance: this.startingBalance,
    defaultRiskPercentage: this.defaultRiskPercentage,
    timezone: this.timezone,
    defaultMarket: this.defaultMarket,
    defaultTimeframe: this.defaultTimeframe,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
module.exports.CURRENCIES = CURRENCIES;
module.exports.MARKETS = MARKETS;
