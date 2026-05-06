const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const Event = require("./models/Event");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// CONNECT DATABASE
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    app.listen(process.env.PORT || 3000, () => {
      console.log("Server running on port", process.env.PORT || 3000);
    });
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

//
// 🔁 BREVO REQUEST FUNCTION
//
async function brevoRequest(endpoint, data) {
  const res = await fetch(`https://api.brevo.com/v3/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Brevo error:", err);
  }

  return res.json();
}

//
// 👤 SIGNUP (LEAD)
//
app.post("/signup", async (req, res) => {
  const { email } = req.body;

  // Save locally
  await Event.create({ email, type: "signup" });

  // Send to Brevo (create contact)
  await brevoRequest("contacts", {
    email,
    listIds: [10],
    updateEnabled: true
  });

  // Track event in Brevo
  await brevoRequest("events", {
    email,
    event: "signup"
  });

  res.json({ message: "Signup tracked" });
});

//
// 🛒 ADD TO CART
//
app.post("/cart", async (req, res) => {
  const { email, items } = req.body;

  await Event.create({
    email,
    type: "add_to_cart",
    data: { items }
  });

  // Send event to Brevo
  await brevoRequest("events", {
    email,
    event: "add_to_cart",
    properties: {
      items
    }
  });

  res.json({ message: "Cart tracked" });
});

//
// 💰 PURCHASE
//
app.post("/purchase", async (req, res) => {
  const { email, order } = req.body;

  await Event.create({
    email,
    type: "purchase",
    data: order
  });

  // Send purchase event to Brevo
  await brevoRequest("events", {
    email,
    event: "purchase",
    properties: order
  });

  res.json({ message: "Purchase tracked" });
});

//
// ⏳ ABANDONED CART SYSTEM (SMART VERSION)
//
setInterval(async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Find carts older than 1 hour
  const carts = await Event.find({
    type: "add_to_cart",
    createdAt: { $lt: oneHourAgo }
  });

  for (let cart of carts) {

    // Check if user already purchased after this cart
    const purchased = await Event.findOne({
      email: cart.email,
      type: "purchase",
      createdAt: { $gt: cart.createdAt }
    });

    if (!purchased) {

      // Send Brevo email
      await brevoRequest("smtp/email", {
        sender: {
          name: "Kwihahiro",
          email: "no-reply@kwihahiro.com"
        },
        to: [{ email: cart.email }],
        subject: "🛒 You forgot your cart!",
        htmlContent: `
          <h2>Hey 👋</h2>
          <p>You left items in your cart.</p>
          <p>Come back and complete your order!</p>
        `
      });

      // Track abandoned event in Brevo
      await brevoRequest("events", {
        email: cart.email,
        event: "abandoned_cart"
      });

      console.log("Abandoned cart email sent to:", cart.email);
    }
  }

}, 10 * 60 * 1000); // runs every 10 minutes

//
// 🚀 START SERVER
//
startServer();