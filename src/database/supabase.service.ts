import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
    private supabase: SupabaseClient;

    constructor(private readonly configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseServiceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            throw new Error('Supabase URL 또는 Service Role Key가 설정되지 않았습니다.');
        }

        this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    }

    getClient(): SupabaseClient {
        return this.supabase;
    }
}
