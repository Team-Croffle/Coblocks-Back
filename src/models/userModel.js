const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid"); // UUID 라이브러리 추가

// 임시 데이터베이스 (테스트 용도)
const localStorageSimulator = {
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
  findUserByEmail: async (email) => {
    const storedUser = storage.getItem(email);
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (e) {
        console.error("JSON 파싱 오류:", e);
        return null; // 파싱 실패 시 null 반환
      }
    }
    return null;
  },

  createUser: async (email, password, nickname, isVerified) => {
    const uid = uuidv4(); // 새로운 UUID 생성
    const newUser = {
      uid, // UID 추가
      email,
      password,
      nickname,
      isVerified: isVerified,
    };
    storage.setItem(email, JSON.stringify(newUser));
    return {
      uid: newUser.uid, // UID 포함
      email: newUser.email,
      nickname: newUser.nickname,
      isVerified: newUser.isVerified,
    }; // 닉네임 포함 (임시 DB는 email을 id처럼 사용)
  },

  verifyUser: async (uid) => {
    // 모든 사용자를 순회하면서 uid가 일치하는 사용자를 찾음
    for (const key in storage.store) {
      try {
        const user = JSON.parse(storage.getItem(key));
        if (user && user.uid === uid) {
          user.isVerified = true;
          storage.setItem(key, JSON.stringify(user));
          return {
            uid: user.uid,
            email: user.email,
            nickname: user.nickname,
            isVerified: user.isVerified,
          };
        }
      } catch (e) {
        console.error("JSON 파싱 오류:", e);
      }
    }
    return null;
  },

  updatePassword: async (uid, newPassword) => {
    for (const key in storage.store) {
      try {
        const user = JSON.parse(storage.getItem(key));
        if (user && user.uid === uid) {
          user.password = newPassword;
          storage.setItem(key, JSON.stringify(user));
          return {
            uid: user.uid,
            email: user.email,
            nickname: user.nickname,
            isVerified: user.isVerified,
          };
        }
      } catch (e) {
        console.error("JSON 파싱 오류:", e);
      }
    }
    return null; // 해당 uid의 사용자를 찾지 못한 경우
  },
};

/*const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

exports.createUser = async (email, password, nickname, isVerified) => {
  const uid = uuidv4(); // 새로운 UUID 생성
  const query = `
    INSERT INTO users (uid, email, password, nickname, is_verified)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING uid, email, nickname, is_verified;
  `;
  const values = [uid, email, password, nickname, isVerified];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    throw error;
  }
};

exports.findUserByEmail = async (email) => {
  const query = `
    SELECT uid, email, nickname, is_verified FROM users
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

exports.verifyUser = async (uid) => { // 파라미터 이름을 uid로 변경
  const query = `
    UPDATE users
    SET is_verified = true
    WHERE uid = $1
    RETURNING uid, email, nickname, is_verified;
  `;
  const values = [uid]; // 파라미터 값을 uid로 사용

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    throw error;
  },
  
  exports.updatePassword = async (uid, newPassword) => {
  const query = `
    UPDATE users
    SET password = $1
    WHERE uid = $2
    RETURNING uid, email, nickname, is_verified;
  `;
  const values = [newPassword, uid];

  try {
    const result = await pool.query(query, values);
    return result.rows[0]; // 업데이트된 사용자 정보 반환 (선택 사항)
  } catch (error) {
    throw error;
  }
};
*/
