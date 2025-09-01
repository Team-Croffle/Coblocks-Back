import { Socket } from 'socket.io';
import { Handshake } from 'socket.io/dist/socket-types';

export interface AuthenticatedUser {
  userId: string;
  userName: string;
}

// handshake에 대한 커스텀 인터페이스
export interface CustomHandshake extends Handshake {
  auth: {
    token?: string;
    [key: string]: any;
  };
}

// 소켓에 대한 커스텀 인터페이스
export interface TypedSocket extends Socket {
  user?: AuthenticatedUser; // 소켓에 저장된 사용자 정보
  room?: any; // 소켓에 저장된 방 정보
  handshake: CustomHandshake;
}

export function getSocketUser(client: Socket): AuthenticatedUser {
  const typedClient = client as TypedSocket;

  if (!typedClient.user) {
    throw new Error('사용자 정보를 확인할 수 없습니다.');
  }
  return typedClient.user;
}
