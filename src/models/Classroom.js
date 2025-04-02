classroom - app / src / models / Classroom.js;

class Classroom {
  constructor(id, name, creator) {
    this.id = id;
    this.name = name;
    this.creator = creator;
    this.users = [];
  }

  addUser(user) {
    this.users.push(user);
  }

  removeUser(userId) {
    this.users = this.users.filter((user) => user.id !== userId);
  }

  getUserList() {
    return this.users.map((user) => user.name);
  }

  static validateClassroomData(data) {
    if (!data.name || typeof data.name !== "string") {
      throw new Error("Invalid classroom name");
    }
    if (!data.creator || typeof data.creator !== "string") {
      throw new Error("Invalid creator ID");
    }
  }
}

export default Classroom;
