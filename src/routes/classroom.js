const express = require("express");
const router = express.Router();
const ClassroomController = require("../controllers/ClassroomController");

const NotImplemented = (req, res) => {
  res.status(501).json({ success: false, message: "Not Implemented Yet" });
};

// 1. 강의실 생성 (POST /api/classrooms)
router.post("/classrooms", ClassroomController.createClassroom);

// 2. 강의실 참여 (POST /api/classrooms/join)
router.post("/classrooms/join", ClassroomController.joinClassroomByCode);

// 3. 강의실 나가기 (POST /api/classrooms/:classroom_code/leave)
// :classroom_code 는 URL 파라미터로, 실제 코드값(예: ABCDEF)으로 대체됩니다.
router.post("/classrooms/:classroom_code/leave", NotImplemented);

// 4. 강의실 삭제 (DELETE /api/classrooms/:classroom_code)
router.delete("/classrooms/:classroom_code", NotImplemented);

// 5. 강의실 사용자 목록 조회 (GET /api/classrooms/:classroom_code/users)
router.get("/classrooms/:classroom_code/users", NotImplemented);

module.exports = router;
