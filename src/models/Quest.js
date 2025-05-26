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
      const { data, error } = await supabase.rpc("get_questlist");
      if (error) {
        logger.error(
          `[Model Quest] Supabase error fetching all quest summaries: ${error.message}`
        );
        throw error; // 에러를 컨트롤러에서 처리할 수 있도록 던짐
      }
      if (!data || (Array.isArray(data) && data.length === 0)) {
        logger.warn("[Model Quest] No quest summaries found or empty data.");
        return []; // 빈 배열 반환
      }
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
        p_quest_id: questId,
      });

      if (error) {
        logger.error(
          `[Model Quest] Supabase error fetching quest by ID ${questId}: ${error.message}`
        );
        throw error;
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        logger.warn(
          `[Model Quest] No quest found or empty data for ID: ${questId}`
        );
        return null; // 또는 throw new Error("Quest not found");
      }
      logger.info(
        `[Model Quest] Successfully fetched quest with ID: ${questId}`
      );
      return data;
    } catch (error) {
      logger.error(
        `[Model Quest] Error in getQuestById for ID ${questId}: ${error.message}`
      );
      throw error; // 컨트롤러에서 처리할 수 있도록 에러 다시 던지기
    }
  }
}

module.exports = Quest;
