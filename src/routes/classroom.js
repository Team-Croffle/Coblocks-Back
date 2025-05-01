const express = require("express");
const router = express.Router();
const ClassroomController = require("../controllers/ClassroomController");

// 1. 강의실 생성 (POST /api/classrooms)
router.post("/classrooms", ClassroomController.createClassroom);

// 2. 강의실 참여 (POST /api/classrooms/join)
router.post("/classrooms/join", ClassroomController.joinClassroomByCode);

// 3. 강의실 나가기 (POST /api/classrooms/:classroom_code/leave)
router.post(
  "/classrooms/:classroom_code/leave",
  ClassroomController.leaveClassroom
);

// 4. 강의실 삭제 (DELETE /api/classrooms/:classroom_code)
router.delete(
  "/classrooms/:classroom_code",
  ClassroomController.deleteClassroom
);

module.exports = router;
