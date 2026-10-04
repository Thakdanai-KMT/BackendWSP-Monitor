import { supabase } from './database.js';

const SERVICE_NAME = 'BackendWSP';

export interface MonitorState {
  isOnline: boolean;
  lastCheckedAt: string;
  lastChangedAt: string;
  lastLatency: number | null;
  lastHttpStatus: number | null;
  lastMessage: string;
}

export async function getMonitorState(): Promise<MonitorState | null> {
  const { data, error } = await supabase
    .from('monitor_status')
    .select(
      'is_online, last_checked_at, last_changed_at, last_latency, last_http_status, last_message',
    )
    .eq('service_name', SERVICE_NAME)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read monitor state: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return {
    isOnline: data.is_online,
    lastCheckedAt: data.last_checked_at,
    lastChangedAt: data.last_changed_at,
    lastLatency: data.last_latency,
    lastHttpStatus: data.last_http_status,
    lastMessage: data.last_message,
  };
}

export async function saveMonitorState(
  state: MonitorState,
): Promise<void> {
  const { error } = await supabase
    .from('monitor_status')
    .upsert(
      {
        service_name: SERVICE_NAME,
        is_online: state.isOnline,
        last_checked_at: state.lastCheckedAt,
        last_changed_at: state.lastChangedAt,
        last_latency: state.lastLatency,
        last_http_status: state.lastHttpStatus,
        last_message: state.lastMessage,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'service_name',
      },
    );

  if (error) {
    throw new Error(
      `Failed to save monitor state: ${error.message}`,
    );
  }
}