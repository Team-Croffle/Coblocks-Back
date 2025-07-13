import { Injectable } from '@nestjs/common';
import { Classroom } from './classroom.interface';

@Injectable()
export class ClassroomService {
    private rooms = new Map<string, Classroom>();

    // 방 생성
    createRoom(id: string, code: string, managerId: string, managerSocketId: string): Classroom | void {
        if (this.rooms.has(code)){
            throw new Error('Room already exists with this code');
        }
        const newRoom: Classroom = {
            id,
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
        if (!room) {
            throw new Error('Room not found');
        }
        return room;
    }

    //방 참가
    joinRoom(code: string, participantId: string): Classroom {
        const room = this.rooms.get(code);
        if (!room) {
            throw new Error('Room not found');
        }
        if (room.state === 'full') {
            throw new Error('Room is full');
        }
        room.participants.push(participantId);
        if (room.participants.length >= 4) { // 예시로 4명 이상이면 만석 처리
            room.state = 'full';
        }
        return room;
    }
}
