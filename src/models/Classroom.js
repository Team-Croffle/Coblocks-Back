const supabase = require("../db/supabase"); // 실제 경로에 맞게 수정해주세요.
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger"); // 실제 경로에 맞게 수정해주세요.

class Classroom {
  static async create(manager_users_id, classroom_name) {
    const classroom_id = uuidv4();
    let classroom_code = null;
    const MAX_RETRIES = 10; // 무한 루프 방지를 위한 최대 재시도 횟수
    let retries = 0;

    // 유일한 강의실 코드가 생성될 때까지 시도
    while (!classroom_code && retries < MAX_RETRIES) {
      const potentialCode = this.generateClassCode();
      const existing = await this.findByCode(potentialCode);
      if (!existing) {
        classroom_code = potentialCode; // 유일한 코드 발견!
      } else {
        console.warn(
          `Generated code ${potentialCode} already exists. Retrying...`
        );
        retries++;
      }
    }

    if (!classroom_code) {
      // 최대 시도 횟수 초과
      throw new Error(
        "Failed to generate a unique classroom code after multiple retries."
      );
    }

    try {
      const { data, error } = await supabase
        .from("classroom")
        .insert([
          {
            classroom_id: classroom_id, // UUID
            classroom_code: classroom_code, // 생성된 고유 코드
            manager_users_id: manager_users_id,
            classroom_name: classroom_name,
          },
        ])
        .select() // 삽입된 전체 행 데이터 반환 요청
        .single(); // 한 행만 삽입했으므로 single() 사용

      if (error) {
        console.error("Supabase insert error:", error);
        // TODO: 더 구체적인 에러 처리 (예: classroom_name 중복 등 제약조건 위반)
        throw error;
      }

      if (!data) {
        // 삽입은 성공했으나 반환된 데이터가 없는 경우 (이론상 발생하기 어려움)
        throw new Error("Classroom created but failed to retrieve data.");
      }

      console.log("Classroom created successfully in DB:", data);
      return data; // 생성된 강의실 객체 반환 (classroom_id 포함)
    } catch (error) {
      console.error("Error during classroom creation in DB:", error);
      // 컨트롤러에서 처리할 수 있도록 에러 다시 던지기
      throw new Error(
        `Failed to create classroom in database: ${error.message}`
      );
    }
  }

  // 강의실 삭제
  // 인자: classroom_id (DB 컬럼 이름 그대로 받음)
  // 반환값: boolean (삭제 성공 여부)
  static async delete(classroom_id) {
    try {
      // 삭제된 행의 수를 확인하기 위해 select()를 사용합니다.
      const { data, error } = await supabase
        .from("classroom")
        .delete()
        .eq("classroom_id", classroom_id)
        .select("classroom_id"); // 삭제된 행의 ID를 선택하여 삭제 여부와 개수 확인

      if (error) {
        logger.error(
          `Supabase error deleting classroom: ${classroom_id}: ${error.message}`,
          error
        );
        // TODO: 특정 Supabase 에러 코드 (예: not found) 처리
        throw error; // 에러 다시 던짐
      }

      // data 배열의 길이를 통해 삭제된 행의 개수 확인
      const deletedCount = data ? data.length : 0;
      if (deletedCount === 0) {
        logger.warn(
          `Classroom ${classroom_id} delete operation found no matching row.`
        );
        return false; // 일치하는 행이 없어서 삭제되지 않았음을 반환
      }

      logger.info(`Classroom ${classroom_id} successfully deleted.`);
      return true; // 일치하는 행을 삭제했음을 반환
    } catch (error) {
      logger.error(`Error in Classroom.delete: ${error.message}`);
      throw new Error(`Failed to delete classroom: ${error.message}`); // 에러 감싸서 다시 던짐
    }
  }

  // 강의실 코드로 찾기
  static async findByCode(classroom_code) {
    try {
      const { data, error } = await supabase
        .from("classroom")
        .select("*")
        .eq("classroom_code", classroom_code)
        .single(); // 결과가 없거나 하나만 있어야 함

      if (error && error.code !== "PGRST116") {
        // PGRST116: Row not found (결과 없는 정상 케이스)
        console.error("Supabase error finding by code:", error);
        throw error;
      }
      return data; // 데이터가 있으면 객체 반환, 없으면 null 반환
    } catch (error) {
      // 내부 또는 네트워크 오류 등
      console.error("Error in findByCode:", error);
      throw new Error("Failed to check classroom code existence.");
    }
  }

  // 강의실 이름 중복 체크
  static async findByName(classroom_name) {
    try {
      const { data, error } = await supabase
        .from("classroom")
        // 존재 여부만 확인하므로 최소한의 컬럼 선택
        .select("classroom_id")
        .eq("classroom_name", classroom_name)
        .limit(1); // 효율성을 위해 첫 번째 결과만 확인

      if (error) {
        logger.error(
          `Supabase error in findByName for "${classroom_name}":`,
          error
        );
        throw error; // 에러 다시 던짐
      }
      // 데이터가 있으면 true, 없으면 false 반환
      return data && data.length > 0; // Boolean 값 반환
    } catch (error) {
      logger.error(
        `Unexpected error checking classroom name existence for "${classroom_name}":`,
        error
      );
      throw new Error(
        `Failed to check classroom name existence: ${error.message}`
      ); // 에러 감싸서 다시 던짐
    }
  }

  // 임의의 6자리 초대 코드 생성
  static generateClassCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

module.exports = Classroom;
