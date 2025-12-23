const Wallet = require("../models/Wallet");

async function getOrCreateWallet(userId) {
  let w = await Wallet.findOne({ user: userId });
  if (!w) w = await Wallet.create({ user: userId, balance: 0, currency: "MYR" });
  return w;
}

module.exports = { getOrCreateWallet };