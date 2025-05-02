const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

const authController = new AuthController();

router.post('/login', authController.login);
router.post('/register', authController.register);

module.exports = router;