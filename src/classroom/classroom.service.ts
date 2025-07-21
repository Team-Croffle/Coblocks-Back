import { Injectable } from '@nestjs/common';
import { Classroom } from './classroom.interface';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { Socket } from 'socket.io';

@Injectable()
export class ClassroomService {
    private roomData = new Map<string, Classroom>();

    // 방 생성
    createRoom(id: string, name: string, code: string, managerId: string, managerSocketId: string): Classroom{
        if (this.roomData.has(code)){
            throw new Error('Room already exists with this code');
        }
        const newRoom: Classroom = {
            id,
            name,
            code,
            managerId,
            managerSocketId, 
            participants: [],
            createdAt: new Date(),
            state: 'wait',
        };
        this.roomData.set(code, newRoom);
        return newRoom;
    }

    // 초대 코드로 방 존재 여부 확인
    findRoomByCode(code: string): Classroom{
        const room = this.roomData.get(code);
        if (!room) { // 방이 존재하지 않으면 에러
            throw new Error('Room not found');
        }

        if (room.participants.length >= 4) { // 예시로 4명 이상이면 만석 처리
            room.state = 'full';
        }

        if (room.state === 'full') { // 방이 만석이면 에러
            throw new Error('Room is full');
        }
        return room;
    }

    //방 참가
    joinRoom(code: string, participantId: string, participantName: string): Classroom {
        const room = this.findRoomByCode(code); // 방 찾기

        if(room.participants.some(participants => participantId === participants.userId)) {
            throw new Error('Participant already in the room'); // 중복 참가 방지
        }

        room.participants.push({ userId: participantId, username: participantName }); // 참가자 추가

        // 상태 업데이트
        if (room.participants.length >= 4) {
            room.state = 'full'; // 만석 상태로 변경
        }
        return room;
    }

    // 방 퇴장
    leaveRoom(roomCode: string, userId: string) {
        //코드로 방찾기
        const room = this.roomData.get(roomCode);
        if (!room) { // 방이 존재하지 않으면 에러
            throw new Error('Room not found');
        }
        
        try {
            // 참가자가 방에 있는지 확인
            const participantIndex = room.participants.findIndex(participant => participant.userId === userId);
            if (participantIndex === -1) {
                throw new Error('Participant not found in the room'); // 참가자가 방에 없으면 에러
            }
            // 개설자인 경우 방 삭제
            if (room.managerId === userId) {
            this.roomData.delete(roomCode); // 개설자가 방을 나가면 방 삭제
            return { success: true, message: '방이 삭제되었습니다' }; // 방 삭제 성공 응답
            }

            // 일반 참가자: 참가자 목록에서 제거
            room.participants.splice(participantIndex, 1);

            // 상태 업데이트
            if (room.participants.length < 4 && room.state === 'full') {
                room.state = 'wait'; // 참가자가 나가면 대기 상태로 변경

            }
            return { 
                success: true, 
                message: '방을 성공적으로 나갔습니다!', 
                participants: room.participants, // 참가자 목록
                state: room.state // 방 상태
            }
        } catch (error) {
            return { success: false, message: error.message }; // 에러 발생 시 클라이언트에 에러 메시지 전송
        }
    }
}
