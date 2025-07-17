import { Injectable } from '@nestjs/common';
import { Classroom } from './classroom.interface';

@Injectable()
export class ClassroomService {
    private rooms = new Map<string, Classroom>();

    // 방 생성
    createRoom(id: string, name: string, code: string, managerId: string, managerSocketId: string): Classroom{
        if (this.rooms.has(code)){
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
        this.rooms.set(code, newRoom);
        return newRoom;
    }

    // 초대 코드로 방 존재 여부 확인
    findRoomByCode(code: string): Classroom{
        const room = this.rooms.get(code);
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
    joinRoom(code: string, participantId: string): Classroom {
        const room = this.findRoomByCode(code); // 방 찾기

        if(room.participants.includes(participantId)) {
            throw new Error('Participant already in the room'); // 중복 참가 방지
        }
        room.participants.push(participantId); // 참가자 추가

        // 상태 업데이트
        if (room.participants.length >= 4) {
            room.state = 'full'; // 만석 상태로 변경
        }
        return room;
    }
}
