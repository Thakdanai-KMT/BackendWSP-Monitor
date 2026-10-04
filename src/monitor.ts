const BACKEND_URL = 'https://backendwsp.onrender.com/api/health';

export interface HealthCheckResult {
  isOnline: boolean;
  statusCode: number | null;
  latency: number | null;
  message: string;
}

export async function checkBackendHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(BACKEND_URL);

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return {
        isOnline: false,
        statusCode: response.status,
        latency,
        message: `Backend returned HTTP ${response.status}`,
      };
    }

    return {
      isOnline: true,
      statusCode: response.status,
      latency,
      message: 'Backend is healthy',
    };
  } catch (error) {
    const latency = Date.now() - startTime;

    return {
      isOnline: false,
      statusCode: null,
      latency,
      message:
        error instanceof Error
          ? error.message
          : 'Unknown error',
    };
  }
}