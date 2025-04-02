classroom-app/src/controllers/classroomController.js

import Classroom from '../models/Classroom';

class ClassroomController {
    constructor() {
        this.classrooms = {};
    }

    createClassroom(req, res) {
        const { name } = req.body;
        const classroomId = Date.now().toString(); // Simple ID generation
        const newClassroom = new Classroom(classroomId, name);
        this.classrooms[classroomId] = newClassroom;
        res.status(201).json(newClassroom);
    }

    joinClassroom(req, res) {
        const { classroomId } = req.params;
        const { userId } = req.body;

        const classroom = this.classrooms[classroomId];
        if (classroom) {
            classroom.addUser(userId);
            res.status(200).json({ message: 'Joined classroom successfully' });
        } else {
            res.status(404).json({ message: 'Classroom not found' });
        }
    }

    leaveClassroom(req, res) {
        const { classroomId } = req.params;
        const { userId } = req.body;

        const classroom = this.classrooms[classroomId];
        if (classroom) {
            classroom.removeUser(userId);
            res.status(200).json({ message: 'Left classroom successfully' });
        } else {
            res.status(404).json({ message: 'Classroom not found' });
        }
    }

    getClassroom(req, res) {
        const { classroomId } = req.params;
        const classroom = this.classrooms[classroomId];
        if (classroom) {
            res.status(200).json(classroom);
        } else {
            res.status(404).json({ message: 'Classroom not found' });
        }
    }
}

export default new ClassroomController();