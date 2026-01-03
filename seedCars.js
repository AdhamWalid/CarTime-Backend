// reassignOwners.js
const mongoose = require("mongoose");
const Car = require("./models/Car");

const MONGO_URI =
  "mongodb+srv://Adham:sVQerx3xeNVWJTVC@cluster0.eqzidv2.mongodb.net/cartime";

// ✅ The ownerId that currently owns BOTH lists (the wrong shared one)
const CURRENT_OWNER_ID = "6958c02c3d6212280fa083e2";

// ✅ Put the correct owners here
const OWNER_ID_LIST1 = "6958cab47ad77bd893d2548b";
const OWNER_ID_LIST2 = "6958ccd328bb1a9a892e8390";

const oid = (id) => new mongoose.Types.ObjectId(id);

// ✅ LIST #2 = Instagram screenshot cars (DEDUPED)
// We match by make + model + pricePerDay (after +10%).
const list2Matchers = [
  { make: "Lamborghini", model: "Huracan", pricePerDay: 5500 },
  { make: "BMW", model: "218i Gran Coupe", pricePerDay: 1099 },
  { make: "Ford", model: "Mustang 5.0", pricePerDay: 1759 },
  { make: "Ford", model: "Mustang Convertible", pricePerDay: 1759 },
  { make: "Mercedes-Benz", model: "E-Class AMG", pricePerDay: 1210 },
  { make: "Mercedes-Benz", model: "C200 Avantgarde", pricePerDay: 1099 },
  { make: "BMW", model: "328i Stage 2+", pricePerDay: 769 },
  { make: "BMW", model: "M8", pricePerDay: 4399 },
  { make: "BMW", model: "X4", pricePerDay: 1099 },
  { make: "Toyota", model: "GT86 Facelift", pricePerDay: 880 },
  { make: "Mercedes-Benz", model: "A35 AMG", pricePerDay: 1210 },
  { make: "Honda", model: "Civic Type R FK8", pricePerDay: 1430 },
  { make: "Porsche", model: "Macan", pricePerDay: 1980 },
  { make: "Toyota", model: "Alphard", pricePerDay: 1320 },
  { make: "Ferrari", model: "F430 F1", pricePerDay: 3080 },
  { make: "Land Rover", model: "Velar", pricePerDay: 2750 },
  { make: "Mercedes-Benz", model: "G63 AMG", pricePerDay: 5500 },
  { make: "Aston Martin", model: "Vantage", pricePerDay: 5500 },
];

async function run() {
  await mongoose.connect(MONGO_URI);

  const currentOwnerId = oid(CURRENT_OWNER_ID);
  const ownerList1 = oid(OWNER_ID_LIST1);
  const ownerList2 = oid(OWNER_ID_LIST2);

  // --- Dry run counts (before updates)
  const total = await Car.countDocuments({ ownerId: currentOwnerId });
  const list2Count = await Car.countDocuments({
    ownerId: currentOwnerId,
    $or: list2Matchers,
  });

  console.log("Cars currently under CURRENT_OWNER_ID:", total);
  console.log("Matched as List #2 (to move):", list2Count);

  // 1) Move List #2 to OWNER_ID_LIST2
  const move2 = await Car.updateMany(
    { ownerId: currentOwnerId, $or: list2Matchers },
    { $set: { ownerId: ownerList2 } }
  );

  console.log("Moved to List2 owner:", move2.modifiedCount);

  // 2) Whatever remains under the current owner becomes List #1 owner
  const move1 = await Car.updateMany(
    { ownerId: currentOwnerId },
    { $set: { ownerId: ownerList1 } }
  );

  console.log("Moved remaining to List1 owner:", move1.modifiedCount);

  await mongoose.disconnect();
  console.log("Done ✅");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});