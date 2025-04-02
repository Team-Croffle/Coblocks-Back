module.exports = {
  PORT: process.env.PORT || 3000,
  DB_URI: process.env.DB_URI || "db://localhost:38000/cobloack-db",
  SOCKET_OPTIONS: {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
      credentials: true,
    },
  },
};
