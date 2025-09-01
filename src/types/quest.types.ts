interface PlayerContext {
  blocks: any[];
}

// Quest 엔티티 타입
export interface QuestEntity {
  quest_id: string;
  quest_description: string;
  quest_difficulty: number;
  quest_type: string;
  solve_status: number;
  quest_context:
    | {
        is_equal: true;
        player1?: PlayerContext;
      }
    | {
        is_equal: false;
        player1?: PlayerContext;
        player2?: PlayerContext;
        player3?: PlayerContext;
        player4?: PlayerContext;
      };
  quest_question: string | { [key: string]: string };
  hint: string;
  answer: string;
  default_stage: {
    col: number;
    row: number;
    tiles: any[];
    objects: any[];
    players: any[];
  };
}

// Supabase RPC 응답 타입
export interface SupabaseRpcResponse<T> {
  data: T[] | null;
  error: {
    message: string;
    code?: string;
  } | null;
}
