const supabase = require("../db/supabase"); // 실제 경로에 맞게 수정해주세요.
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger"); // 실제 경로에 맞게 수정해주세요.

class Classroom {
  static async create(manager_users_id, classroom_name) {
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
      const { data, error } = await supabase.rpc("handle_create_classroom", {
        p_classroom_code: classroom_code,
        p_manager_users_id: manager_users_id,
        p_classroom_name: classroom_name,
      });

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
    logger.info(
      `Attempting to delete classroom ${classroom_id} via RPC function 'delete_classroom_securely'.`
    );
    try {
      // 삭제된 행의 수를 확인하기 위해 select()를 사용합니다.
      const { error } = await supabase.rpc("handle_delete_classroom", {
        target_classroom_id: classroom_id,
      });

      if (error) {
        // RPC 호출 시 발생할 수 있는 다양한 오류들 (예: 함수 없음, 권한 없음, 함수 내부 오류 등)
        logger.error(
          `Supabase RPC error deleting classroom ${classroom_id}: ${error.message}`,
          error
        );
        throw error; // 오류를 다시 던져서 컨트롤러에서 처리하도록 함
      }

      // Security Definer 함수가 void를 반환하고 오류가 없으면 성공으로 간주
      logger.info(
        `Classroom ${classroom_id} deletion RPC call executed successfully.`
      );
      return true; // 함수 호출 성공 (실제 삭제 여부는 DB 함수 로직에 따름)
    } catch (error) {
      // 여기서 잡히는 오류는 rpc 호출 실패 또는 위에서 던진 error
      logger.error(
        `Error in Classroom.delete (RPC) for ${classroom_id}: ${error.message}`
      );
      // 컨트롤러가 이 에러를 받아 500 응답 등을 할 수 있도록 다시 던짐
      // 이전처럼 false를 반환하는 대신 에러를 던지는 것이 더 명확할 수 있음
      throw new Error(
        `Failed to execute handle_delete_classroom RPC: ${error.message}`
      );
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
