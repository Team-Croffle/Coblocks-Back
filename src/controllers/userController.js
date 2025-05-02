class UserController {
    constructor(userModel) {
        this.userModel = userModel;
    }

    async getUserInfo(req, res) {
        try {
            const userId = req.params.id;
            const user = await this.userModel.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.status(200).json(user);
        } catch (error) {
            res.status(500).json({ message: 'Error retrieving user information', error });
        }
    }

    async updateUserProfile(req, res) {
        try {
            const userId = req.params.id;
            const updatedData = req.body;
            const updatedUser = await this.userModel.findByIdAndUpdate(userId, updatedData, { new: true });
            if (!updatedUser) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.status(200).json(updatedUser);
        } catch (error) {
            res.status(500).json({ message: 'Error updating user profile', error });
        }
    }
}

export default UserController;