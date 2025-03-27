// models/user.js
const { Pool } = require("pg");

// 임시 데이터베이스
const localStorageSimulator = {
  //(테스트 용도)
  store: {},
  setItem: function (key, value) {
    this.store[key] = String(value);
  },
  getItem: function (key) {
    return this.store.hasOwnProperty(key) ? this.store[key] : null;
  },
  removeItem: function (key) {
    delete this.store[key];
  },
  clear: function () {
    this.store = {};
  },
};

const storage =
  typeof localStorage === "undefined" ? localStorageSimulator : localStorage;

module.exports = {
  async findUserByEmail(email) {
    const storedUser = storage.getItem(email);
    return storedUser ? JSON.parse(storedUser) : null;
  },

  async createUser(email, password) {
    const newUser = { email, password };
    storage.setItem(email, JSON.stringify(newUser));
    return newUser;
  },
};

/*const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

exports.createUser = async (email, password) => {
  const query = `
    INSERT INTO users (email, password)
    VALUES ($1, $2)
    RETURNING *;
  `;
  const values = [email, password];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

exports.findUserByEmail = async (email) => {
  const query = `
    SELECT * FROM users
    WHERE email = $1;
  `;
  const values = [email];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    throw error;
  }
};
*/
