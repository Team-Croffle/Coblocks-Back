class User {
    constructor(id, username, email) {
        this.id = id;
        this.username = username;
        this.email = email;
    }

    static fromData(data) {
        return new User(data.id, data.username, data.email);
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            email: this.email
        };
    }
}

export default User;