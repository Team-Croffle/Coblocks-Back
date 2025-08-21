import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ClassroomService } from 'src/classroom/classroom.service';
import { SelectProblemDto } from './activityDto/SelectProblem.dto';
import { WsException } from '@nestjs/websockets';
import { SubmitSolutionDto } from './activityDto/SubmitSolution.dto';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from 'src/database/supabase.service';
import { events } from 'src/utils/events';
import { ActivityStateService } from './activity-state.service';

@Injectable()
export class ActivityService {
  private readonly supabase: SupabaseClient; // supabase 클라이언트를 담을 변수
  constructor(
    private readonly classroomService: ClassroomService,
    private readonly activityStateService: ActivityStateService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient(); // supabase 클라이언트 초기화
  }

  // 문제 세트 선택
  async selectProblemSet(client: Socket, server: Server, data: SelectProblemDto) {
    const room = this.classroomService.findRoomByCode(data.code);
    if (!room) {
      console.log(`[ActivityService] 해당 방을 찾을 수 없습니다`);
      throw new WsException('해당 방을 찾을 수 없습니다.');
    }

    const { data: questDetailsArray, error: rpcError } = await this.supabase.rpc(
      'get_quest_for_solving',
      { p_quest_id: data.questId },
    );
    if (rpcError) {
      console.error(`[Activity Service] Supabase RPC error:`, rpcError.message);
      throw new WsException('문제를 불러오는 중 오류가 발생했습니다.');
    }
    if (!questDetailsArray || questDetailsArray.length === 0) {
      throw new WsException('해당 ID의 문제를 찾을 수 없습니다.');
    }
    const questDetails = questDetailsArray[0];
    // activityStateService 통해 방의 활동 상태 업데이트
    this.activityStateService.setSelectedQuest(room.id, questDetails);

    // 방 전체에 선택된 문제 정보 브로드캐스트
    const payload = { questInfo: questDetails };
    server.to(room.code).emit(events.ACTIVITY_PROBLEM_SELECTED, payload);

    console.log(
      `[ActivityService] Manager selected quest ${data.questId} for room ${room.code}. Broadcasted to all.`,
    );

    // 게이트웨이의 Ack콜백으로 성공 응답 반환
    return { success: true, message: '문제 세트가 성공적으로 선택되었습니다.' };
  }

  // 활동 시작
  startActivity(client: Socket, server: Server) {
    // socketId로 방 정보 가져오기
    const classroomId = this.classroomService.getRoomIdBySocketId(client.id);
    if (!classroomId) {
      throw new WsException('참여중인 강의실이 없습니다.');
    }
    const room = this.classroomService.getRoomById(classroomId);
    if (!room) {
      throw new WsException('강의실 정보를 찾을 수 없습니다.');
    }
    const activity = this.activityStateService.getActivityState(room.id);
    if (!activity) {
      throw new WsException('활동 정보를 찾을 수 없습니다.');
    }

    // 상태 확인 (권한은 ManagerGuard에서 처리됨)
    if (!activity.currentQuest) {
      throw new WsException('활동을 시작할 문제 세트가 선택되지 않았습니다.');
    }
    if (activity.status !== 'waiting') {
      throw new WsException('활동을 시작할 수 있는 상태가 아닙니다 (이미 시작되었거나 종료됨).');
    }

    // 참여자들에게 파트 번호 배정
    const participants = Array.from(room.participants.values());
    if (participants.length === 0) {
      throw new WsException('참여자가 없습니다. 활동을 시작할 수 없습니다.');
    }

    const assignments = participants.map((participant, index) => ({
      userId: participant.userId,
      userName: participant.userName,
      partNumber: index + 1, // 1부터 시작하는 파트 번호
    }));

    // activityStateService를 통해 방의 활동 상태 업데이트
    this.activityStateService.startActivity(room.id, assignments);

    // 각 참가자들에게 'activity begin' 이벤트 전송
    assignments.forEach((assignment) => {
      const targetParticipant = participants.find((p) => p.userId === assignment.userId);
      if (!targetParticipant) return;

      const questDetails = activity.currentQuest;

      let userQuestContent = {};
      let userQuestQuestion = '문제 설명을 불러올 수 없습니다.';

      if (questDetails.quest_context.is_equal) {
        userQuestContent = questDetails.quest_context.player1; // 동일한 블록 사용
        userQuestQuestion = questDetails.quest_question; // 동일한 질문 사용
      } else {
        const playerKey = `player${assignment.partNumber}`;
        userQuestContent = questDetails.quest_context[playerKey];
        userQuestQuestion = questDetails.quest_question[playerKey];
      }

      const payload = {
        questInfo: {
          id: questDetails.quest_id,
          overall_description: questDetails.quest_description,
          difficulty: questDetails.quest_difficulty,
          type: questDetails.quest_type,
          is_equal: questDetails.quest_context.is_equal,
          blockly_workspace: userQuestContent,
          detailed_question: userQuestQuestion,
          default_stage: questDetails.default_stage,
        },
        myPartNumber: assignment.partNumber,
        allParticipantsAssignments: assignments,
      };

      server.to(targetParticipant.socketId).emit(events.ACTIVITY_BEGIN, payload);
    });
    console.log(`[ActivityService] Activity started in room ${room.code}.`);

    return { success: true, message: '활동이 시작되었습니다.' };
  }

  // 솔루션 제출
  submitSolution(client: Socket, server: Server, data: SubmitSolutionDto) {
    // 방 정보 및 활동 정보 조회
    const classroomId = this.classroomService.getRoomIdBySocketId(client.id);
    if (!classroomId) throw new WsException('참여중인 강의실이 없습니다.');

    const room = this.classroomService.getRoomById(classroomId);
    if (!room) throw new WsException('강의실 정보를 찾을 수 없습니다.');

    const activity = this.activityStateService.getActivityState(classroomId);
    if (!activity) throw new WsException('활동 정보를 찾을 수 없습니다.');

    // 상태 확인: 상태가 'active'여야 함
    if (activity.status !== 'active') {
      throw new WsException('활동이 진행 중이 아닙니다. 솔루션을 제출할 수 없습니다.');
    }

    const user = (client as any).user;
    const userId = user.userId; // 클라이언트의 userId를 가져옵니다.
    const userName = user.userName; // 클라이언트의 userName을 가져옵니다.

    // 제출자의 파트 번호 조회
    const assignment = activity.partAssignments.find((a) => a.userId === userId);
    if (!assignment) {
      throw new WsException('해당 사용자의 파트 번호를 찾을 수 없습니다.');
    }
    const partNumber = assignment.partNumber;

    // activityStateService를 통해 솔루션 제출 처리
    this.activityStateService.updateUserSubmission(
      classroomId,
      userId,
      partNumber,
      data.submissionContent,
    );

    // 방 전체에 제출 완료 알림 브로드캐스트
    const payload = {
      userId: userId,
      userName: userName,
      partNumber: partNumber,
      message: `${userName} 님이 솔루션을 제출했습니다.`,
    };
    server.to(room.code).emit(events.ACTIVITY_SUBMITTED, payload);
    console.log(
      `[ActivityService] User ${userName} submitted solution for part ${partNumber} in room ${classroomId}.`,
    );
    return { success: true, message: '성공적으로 제출되었습니다.' };
  }

  // 최종 제출 요청
  requestFinalSubmission(client: Socket, server: Server, data: any) {
    // 방 정보 조회
    const room = this.classroomService.findRoomByCode(data.code);
    if (!room) {
      throw new WsException('해당 방을 찾을 수 없습니다.');
    }

    // 빈자리 자동 제출 처리
    const activity = this.activityStateService.getActivityState(room.id);
    const participantCount = activity?.partAssignments.length || 0;

    for (let partNumber = participantCount + 1; partNumber <= 4; partNumber++) {
      this.activityStateService.updateUserSubmission(
        room.id,
        `auto-part${partNumber}`,
        partNumber,
        'CORRECT_ANSWER',
      );
    }

    // activityStateService로부터 모든 제출물 가져오기
    const allSubmissions = this.activityStateService.getAllSubmissions(room.id);

    // 모든 참여자에게 최종 제출 요청 브로드캐스트
    const payload = {
      finalSubmissions: allSubmissions,
    };
    server.to(room.code).emit(events.ACTIVITY_FINAL_SUBMITTED, payload);

    console.log(
      `[ActivityService] Final submissions for room ${room.code} broadcasted by manager.`,
    );

    return {
      success: true,
      message: '모든 제출물을 공유했습니다.',
      finalSubmissions: allSubmissions,
    }; // 응답에 제출물 포함
  }

  // 활동 종료
  endActivity(client: Socket, server: Server, data: { code: string }) {
    const room = this.classroomService.findRoomByCode(data.code);
    if (!room) {
      throw new WsException('해당 방을 찾을 수 없습니다.');
    }

    const result = this.activityStateService.endCurrentActivity(room.id);

    if (result) {
      // 방 전체에 활동 종료 알림 브로드캐스트
      const payload = {
        message: '방장에 의해 활동이 종료되었습니다.',
      };
      server.to(room.code).emit(events.ACTIVITY_ENDED, payload);

      console.log(`[ActivityService] Activity ended in room ${room.code} by manager.`);
      return { success: true, message: '활동이 종료되었습니다.' };
    } else {
      throw new WsException('활동을 종료할 수 없습니다. 현재 활동 상태를 확인하세요.');
    }
  }

  // 기타 필요한 메소드들...
}
