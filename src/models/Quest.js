// src/models/Quest.js

const supabase = require("../db/supabase"); // Supabase 클라이언트
const logger = require("../utils/logger"); // 로거

class Quest {
  static async getAllQuestSummaries() {
    logger.info(
      "[Model Quest] Attempting to fetch all quest summaries from DB."
    );
    try {
      // 함수로 대체 예정?
      const { data, error } = await supabase
        .from("quest") // 실제 테이블 이름이 'quest'인지 확인 필요
        .select(
          "quest_id, chapter_id, quest_description, quest_difficulty, quest_type, solve_status" // 추후 변경사항에 따라 변경
        ); // 필요한 컬럼만 선택

      if (error) {
        logger.error(
          "[Model Quest] Supabase error fetching quest summaries:",
          error
        );
        throw error;
      }

      logger.info(
        `[Model Quest] Successfully fetched ${
          data ? data.length : 0
        } quest summaries.`
      );
      return data; // 예: [{ quest_id, chapter_id, ... }, ...]
    } catch (error) {
      logger.error(
        `[Model Quest] Error in getAllQuestSummaries: ${error.message}`
      );
      throw error; // 컨트롤러에서 처리할 수 있도록 에러 다시 던지기
    }
  }

  // quest 테이블과 quest_detail 테이블을 조인하여 quest_id로 퀘스트 상세정보를 가져오는 메서드
  static async findQuestById(questId) {
    logger.info(`[Model Quest] Attempting to fetch quest with ID: ${questId}`);
    try {
      const { data, error } = await supabase.rpc("get_quest_for_solving", {
        questId: questId,
      });

      if (error) {
        logger.error(
          `[Model Quest] Supabase error fetching quest by ID ${questId}: ${error.message}`
        );
        throw error;
      }

      if (!data) {
        logger.error(`[Model Quest] No quest found with ID: ${questId}`);
        throw new Error("Quest not found");
      }
    } catch (error) {
      logger.error(
        `[Model Quest] Error in getQuestById for ID ${questId}: ${error.message}`
      );
      throw error; // 컨트롤러에서 처리할 수 있도록 에러 다시 던지기
    }
  }
}

module.exports = Quest;
