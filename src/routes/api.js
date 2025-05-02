const express = require('express');
const router = express.Router();
const ClassroomController = require('../controllers/classroomController');
const UserController = require('../controllers/userController');

// Create a new classroom
router.post('/classrooms', ClassroomController.createClassroom);

// Join a classroom
router.post('/classrooms/:id/join', ClassroomController.joinClassroom);

// Leave a classroom
router.post('/classrooms/:id/leave', ClassroomController.leaveClassroom);

// Get user information
router.get('/users/:id', UserController.getUser);

// Update user profile
router.put('/users/:id', UserController.updateUser);

module.exports = router;