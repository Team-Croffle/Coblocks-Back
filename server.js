require("dotenv").config();

const express = require("express");
const app = express();
const routes = require("./src/routes/index");
const authRoutes = require("./src/routes/authRoute");
const path = require("path");

app.use(express.json());
// static file serving
app.use(express.static(path.join(__dirname, "public")));

app.use("/", routes);
app.use("/auth", authRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log("Listening on " + port);
});

module.exports = app;
