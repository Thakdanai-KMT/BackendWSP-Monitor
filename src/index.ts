import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from 'discord.js';

import { checkBackendHealth } from './monitor.js';
import { getMonitorState, saveMonitorState } from './status.js';
import { getRequiredEnv } from './env.js';

const token = getRequiredEnv('DISCORD_TOKEN');
const channelId = getRequiredEnv('DISCORD_CHANNEL_ID');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function monitorBackend(): Promise<void> {
  console.log('Checking BackendWSP...');

  const result = await checkBackendHealth();

  console.log({
    isOnline: result.isOnline,
    statusCode: result.statusCode,
    latency: result.latency,
    message: result.message,
  });

  const previousState = await getMonitorState();

  const now = new Date().toISOString();

  const statusChanged =
    previousState === null ||
    previousState.isOnline !== result.isOnline;

  const lastChangedAt = statusChanged
    ? now
    : previousState.lastChangedAt;

  if (statusChanged) {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isSendable()) {
      throw new Error(
        'Discord channel is invalid or cannot send messages',
      );
    }

    let title: string;
    let description: string;

    if (result.isOnline) {
      title =
        previousState === null
          ? '🟢 BackendWSP Online'
          : '🟢 BackendWSP Recovered';

      description =
        previousState === null
          ? 'BackendWSP is online and responding normally.'
          : 'BackendWSP has recovered and is responding normally.';
    } else {
      title = '🔴 BackendWSP Offline';
      description =
        'BackendWSP is not responding normally.';
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .addFields(
        {
          name: 'Status',
          value: result.isOnline ? 'Online' : 'Offline',
          inline: true,
        },
        {
          name: 'HTTP',
          value: result.statusCode
            ? `${result.statusCode}`
            : 'N/A',
          inline: true,
        },
        {
          name: 'Latency',
          value: result.latency !== null
            ? `${result.latency} ms`
            : 'N/A',
          inline: true,
        },
      )
      .setTimestamp();

    await channel.send({
      embeds: [embed],
    });

    console.log('Discord notification sent.');
  } else {
    console.log('Status unchanged. No Discord notification.');
  }

  await saveMonitorState({
    isOnline: result.isOnline,
    lastCheckedAt: now,
    lastChangedAt,
    lastLatency: result.latency,
    lastHttpStatus: result.statusCode,
    lastMessage: result.message,
  });

  console.log('Monitor state saved to Supabase.');
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  try {
    await monitorBackend();
  } catch (error) {
    console.error('Monitor failed:', error);
  } finally {
    client.destroy();
  }
});

client.login(token);