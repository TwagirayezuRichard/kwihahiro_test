const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  email: String,
  type: String, // signup, add_to_cart, purchase
  data: Object,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", EventSchema);