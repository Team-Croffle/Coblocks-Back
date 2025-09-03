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
import { QuestEntity, SupabaseRpcResponse } from 'src/types/quest.types';
import { getSocketUser } from 'src/types/socket.types';

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

  private readonly MAX_PARTICIPANT = 4;

  // 문제 세트 선택
  async selectProblemSet(client: Socket, server: Server, data: SelectProblemDto) {
    const room = this.classroomService.findRoomByCode(data.code);
    if (!room) {
      console.log(`[ActivityService] 해당 방을 찾을 수 없습니다`);
      throw new WsException('해당 방을 찾을 수 없습니다.');
    }

    const { data: questDetailsArray, error: rpcError } = (await this.supabase.rpc(
      'get_quest_for_solving',
      { p_quest_id: data.questId },
    )) as SupabaseRpcResponse<QuestEntity>;

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
    const { room, activity } = this._getRoomAndActivity(client.id);

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

      // 1. 명시적 타입 단언
      const questDetails = activity.currentQuest as QuestEntity;
      if (!questDetails) {
        console.error(`[Activity Service] currentQuest is null for room ${room.id}`);
        return;
      }

      let userQuestContent = {};
      let userQuestQuestion = '문제 설명을 불러올 수 없습니다.';

      // 2. context도 타입 단언
      const context = questDetails.quest_context;

      if (context.is_equal === true) {
        // 3. 안전한 접근 - player1이 있으면 사용, 없으면 빈 객체
        userQuestContent = context.player1?.blocks || {};

        if (typeof questDetails.quest_question === 'string') {
          userQuestQuestion = questDetails.quest_question;
        }
      } else {
        // 4. 동적 속성 접근을 안전하게
        const playerKey = `player${assignment.partNumber}` as
          | 'player1'
          | 'player2'
          | 'player3'
          | 'player4';
        userQuestContent = context[playerKey]?.blocks || {};

        if (
          typeof questDetails.quest_question === 'object' &&
          questDetails.quest_question !== null
        ) {
          const questionObj = questDetails.quest_question as Record<string, string>;
          userQuestQuestion = questionObj[playerKey] || '문제 설명을 불러올 수 없습니다.';
        }
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

  // 활동시 데이터 전송
  // 활동 시작
  activityData(client: Socket, server: Server) {
    const { room, activity } = this._getRoomAndActivity(client.id);

    // 요청을 보낸 사용자 정보 조회
    const user = getSocketUser(client);
    const userId = user.userId;

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

    // activityStateService를 통해 방의 활동 상태 업데이트 (한 번만)
    this.activityStateService.startActivity(room.id, assignments);

    // 🔹 요청을 보낸 사용자의 할당 정보만 찾기
    const userAssignment = assignments.find((assignment) => assignment.userId === userId);
    if (!userAssignment) {
      throw new WsException('해당 사용자의 파트 정보를 찾을 수 없습니다.');
    }

    // 🔹 요청을 보낸 사용자를 위한 데이터만 준비
    const questDetails = activity.currentQuest as QuestEntity;
    if (!questDetails) {
      console.error(`[Activity Service] currentQuest is null for room ${room.id}`);
      throw new WsException('문제 정보를 찾을 수 없습니다.');
    }

    let userQuestContent = {};
    let userQuestQuestion = '문제 설명을 불러올 수 없습니다.';

    const context = questDetails.quest_context;

    if (context.is_equal === true) {
      // 모든 참가자가 같은 문제를 푸는 경우
      userQuestContent = context.player1?.blocks || {};

      if (typeof questDetails.quest_question === 'string') {
        userQuestQuestion = questDetails.quest_question;
      }
    } else {
      // 각 참가자가 다른 파트를 담당하는 경우
      const playerKey = `player${userAssignment.partNumber}` as
        | 'player1'
        | 'player2'
        | 'player3'
        | 'player4';
      userQuestContent = context[playerKey]?.blocks || {};

      if (typeof questDetails.quest_question === 'object' && questDetails.quest_question !== null) {
        const questionObj = questDetails.quest_question as Record<string, string>;
        userQuestQuestion = questionObj[playerKey] || '문제 설명을 불러올 수 없습니다.';
      }
    }

    // 🔹 요청을 보낸 클라이언트에게만 전송
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
      myPartNumber: userAssignment.partNumber,
      allParticipantsAssignments: assignments,
    };

    // 🔹 요청한 클라이언트에게만 응답
    client.emit('activity:resData', payload);

    console.log(
      `[ActivityService] Activity data sent to user ${user.userName} (part ${userAssignment.partNumber}) in room ${room.code}.`,
    );

    return {
      success: true,
      message: '활동 데이터가 성공적으로 전송되었습니다.',
      partNumber: userAssignment.partNumber,
    };
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

    const user = getSocketUser(client);
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
  requestFinalSubmission(client: Socket, server: Server, data: { code: string }) {
    // 방 정보 조회
    const room = this.classroomService.findRoomByCode(data.code);
    if (!room) {
      throw new WsException('해당 방을 찾을 수 없습니다.');
    }

    const activity = this.activityStateService.getActivityState(room.id);

    if (activity?.status !== 'active') {
      throw new WsException('활동이 진행 중이 아닙니다. 최종 제출을 요청할 수 없습니다.');
    }

    const participantCount = activity?.partAssignments.length || 0;
    // 현재 제출물 갯수
    const submissionCount = Object.keys(activity.submissions).length;

    // 참가자들이 제출해야만 최종 제출 가능
    if (participantCount !== submissionCount) {
      throw new WsException('모든 참가자가 제출해야 최종 제출이 가능합니다.');
    }

    // 빈자리 자동 제출 처리
    for (let partNumber = participantCount + 1; partNumber <= this.MAX_PARTICIPANT; partNumber++) {
      this.activityStateService.updateUserSubmission(
        room.id,
        `auto-part${partNumber}`,
        partNumber,
        'CORRECT_ANSWER',
      );
      console.log(`[ActivityService] 빈자리 자동 제출 처리 완료`);
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

  // 헬퍼 메소드
  private _getRoomAndActivity(socketId: string) {
    const classroomId = this.classroomService.getRoomIdBySocketId(socketId);
    if (!classroomId) throw new WsException('참여중인 강의실이 없습니다.');

    const room = this.classroomService.getRoomById(classroomId);
    if (!room) throw new WsException('강의실 정보를 찾을 수 없습니다.');

    const activity = this.activityStateService.getActivityState(room.id);
    if (!activity) throw new WsException('활동 정보를 찾을 수 없습니다.');

    return { room, activity };
  }
}
